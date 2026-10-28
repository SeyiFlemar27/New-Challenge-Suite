import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { isPrivateChallengeRecord } from "@/lib/server/challenge-access";
import { votingAccountRestricted } from "@/lib/voting-account-policy";
import { deliverNormalReminderBatch } from "@/lib/server/normal-submission-reminders";
export async function deliverNormalNotificationOutbox(db: Firestore, challengeId: string) {
  const state = db.collection("notificationRecoveryState").doc(`normal_${challengeId}`), cursor = (await state.get()).data()?.cursor;
  const base = db.collection("normalNotificationOutbox").where("challengeId", "==", challengeId).orderBy(FieldPath.documentId());
  let events = await (typeof cursor === "string" ? base.startAfter(cursor) : base).limit(25).get();
  if (events.empty && cursor) events = await base.limit(25).get();
  if (!events.empty) await state.set({ cursor: events.docs.at(-1)!.id, updatedAt: new Date().toISOString() });
  let delivered = 0;
  for (const event of events.docs) {
    if (event.data().type === "normal_submission_reminder") { delivered += await deliverNormalReminderBatch(db, event.id); continue; }
    const count = await db.runTransaction(async transaction => {
      const current = await transaction.get(event.ref);
      const data = current.data() ?? {};
      if (!current.exists || data.status === "completed") return 0;
      const challenge = await transaction.get(db.collection("challenges").doc(challengeId));
      if (!challenge.exists || data.type === "challenge_results" && (challenge.data()?.resultsConfirmed !== true || challenge.data()?.adminWinnerApprovalStatus !== "approved" && challenge.data()?.automaticWinnerVerificationStatus !== "verified")) return 0;
      let query = db.collection("challengeParticipants").where("challengeId", "==", challengeId).orderBy(FieldPath.documentId()).limit(100);
      if (typeof data.cursor === "string") query = query.startAfter(data.cursor);
      const participants = await transaction.get(query);
      const recipients = new Set(participants.docs.filter(doc => ["entered", "enrolled", "approved", "active", "joined", "checked_in", "submitted", "winner", ...(data.type === "challenge_cancelled" ? ["registered", "pending", "pending_approval", "waitlisted"] : [])].includes(String(doc.data().status))).map(doc => String(doc.data().userId)).filter(uid => uid && !uid.includes("/")));
      if (!data.cursor && typeof data.creatorId === "string" && data.creatorId) recipients.add(data.creatorId);
      const refs = [...recipients].map(userId => ({ userId, ref: db.collection("notifications").doc(deterministicId("normal_notice", event.id, userId)) }));
      const existing = refs.length ? await transaction.getAll(...refs.map(item => item.ref)) : [];
      const accounts = refs.length ? await transaction.getAll(...refs.map(row => db.collection("users").doc(row.userId))) : [];
      const grants = isPrivateChallengeRecord(challenge.data() ?? {}) && refs.length ? await transaction.getAll(...refs.map(row => db.collection("privateChallengeAccess").doc(`${challengeId}_${row.userId}`))) : [];
      const now = new Date().toISOString();
      let created = 0;
      refs.forEach((item, index) => {
        if (!accounts[index].exists || votingAccountRestricted(accounts[index].data()!) || grants.length && grants[index].data()?.status !== "approved" && item.userId !== data.creatorId) return;
        if (!existing[index].exists) transaction.create(db.collection("normalEmailOutbox").doc(item.ref.id), { challengeId, userId: item.userId, sourceEventId: event.id, title: data.title, message: data.message, status: "pending", createdAt: now });
        if (!existing[index].exists) transaction.create(item.ref, { id: item.ref.id, userId: item.userId, type: data.type, title: data.title, message: data.message, body: data.message, status: "unread", read: false, actionUrl: `/challenges/${challengeId}`, targetId: challengeId, entityType: "challenge", entityId: challengeId, createdAt: now, updatedAt: now, delivery: { inApp: true, email: false, push: false }, metadata: { sourceEventId: event.id, effectiveVotingStartsAt: data.effectiveVotingStartsAt ?? null, effectiveVotingEndsAt: data.effectiveVotingEndsAt ?? null } });
        if (!existing[index].exists) created++;
      });
      transaction.update(event.ref, { cursor: participants.docs.at(-1)?.id ?? data.cursor ?? null, status: participants.size < 100 ? "completed" : "pending", emailDeliveryStatus: "provider_not_configured", updatedAt: now });
      return created;
    });
    delivered += count;
  }
  return { delivered };
}
