import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { votingAccountRestricted } from "@/lib/voting-account-policy";

/** Official sporting outcomes are independent of wallet clearance or payouts. */
export async function deliverLiveEventResults(db: Firestore, progressId: string, now = new Date()) {
  return db.runTransaction(async tx => {
    const ref = db.collection("notificationAudienceProgress").doc(progressId), source = await tx.get(ref), progress = source.data() ?? {};
    if (!source.exists || progress.status !== "pending" || progress.context?.kind !== "live_results") return { created: 0 };
    const eventId = String(progress.context.id), [event, challenge] = await tx.getAll(db.collection("liveEvents").doc(eventId), db.collection("challenges").doc(eventId));
    const record = { ...event.data(), ...challenge.data() };
    if (!event.exists || record.resultsPublishedAt !== progress.version || !record.resultsPublishedBy || !Array.isArray(record.publishedPhysicalResults) || ["cancelled", "deleted"].includes(String(record.status))) return { created: 0, held: true };
    let query = db.collection("liveEventRegistrations").where("eventId", "==", eventId).orderBy(FieldPath.documentId());
    if (typeof progress.cursor === "string") query = query.startAfter(progress.cursor);
    const page = await tx.get(query.limit(50));
    const writes = new Map<string, string>();
    for (const row of page.docs) {
      const participant = row.data(), uid = String(participant.userId ?? "");
      if (participant.kind !== "competitor" || participant.guestSession === true || ["withdrawn", "cancelled", "refunded", "disqualified"].includes(String(participant.status)) || !uid || uid.includes("/")) continue;
      const winner = record.publishedPhysicalResults.some((result: { userId?: string }) => result.userId === uid);
      const id = winner ? `live_result_${eventId}_${uid}` : createHash("sha256").update(`${uid}\0live_results:${eventId}:${progress.version}`).digest("hex");
      const [account, prior] = await tx.getAll(db.collection("users").doc(uid), db.collection("notifications").doc(id));
      if (account.exists && !votingAccountRestricted(account.data()!) && !prior.exists) writes.set(id, uid);
    }
    for (const [id, uid] of writes) tx.create(db.collection("notifications").doc(id), { id, userId: uid, type: "live_event_result", essential: true, category: "participation", title: "Official event results are ready", message: "The verified physical competition results are available. Prize credit, clearance and withdrawal status are tracked separately.", actionUrl: `/live-events/${eventId}`, read: false, status: "unread", createdAt: now.toISOString(), delivery: { inApp: true, email: false, push: false } });
    tx.update(ref, { cursor: page.docs.at(-1)?.id ?? progress.cursor ?? null, status: page.size < 50 ? "completed" : "pending", updatedAt: now.toISOString() });
    return { created: writes.size };
  });
}
