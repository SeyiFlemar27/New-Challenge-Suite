import type { Firestore } from "firebase-admin/firestore";
import { publicationSafetyHold } from "@/lib/publishing-policy";
import { requireConfirmedPublicationFunding } from "@/lib/server/publication-guards";
import { verifyChallengeMedia } from "@/lib/server/media-verification";
import { verifyTournamentBuilderMedia } from "@/lib/server/tournament-media-verification";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";

export async function moderateChallengeException(db: Firestore, input: { caseId: string; action: "hold" | "remove" | "release" | "dismiss"; reason: string; actorId: string; expectedUpdatedAt: string }) {
  const caseRef = db.collection("challengeModerationCases").doc(input.caseId), initial = await caseRef.get();
  if (!initial.exists) throw new Error("MODERATION_CASE_NOT_FOUND");
  const entry = initial.data()!, source = entry.source === "tournaments" ? "tournaments" : "challenges";
  const targetRef = db.collection(source).doc(String(entry.targetId)), target = await targetRef.get();
  if (!target.exists) throw new Error("MODERATION_TARGET_NOT_FOUND");
  if (input.action === "release" && target.data()?.publishedAt) {
    const data = target.data()!;
    if (source === "tournaments") await verifyTournamentBuilderMedia({ ...data, id: target.id }, String(data.hostId));
    else await verifyChallengeMedia(db, target.id, data, String(data.creatorId ?? data.hostId));
  }
  return db.runTransaction(async tx => {
    const [freshCase, freshTarget] = await Promise.all([tx.get(caseRef), tx.get(targetRef)]);
    const row = freshCase.data(), record = freshTarget.data();
    if (!row || !record || row.updatedAt !== input.expectedUpdatedAt || record.updatedAt !== target.data()?.updatedAt) throw new Error("MODERATION_STATE_CHANGED");
    const now = new Date().toISOString(), ownerId = String(record.creatorId ?? record.hostId ?? "");
    if (ownerId === input.actorId) throw new Error("SELF_MODERATION_PROHIBITED");
    const update: Record<string, unknown> = {};
    if (input.action === "release") {
      if (!["held", "suspended", "removed"].includes(String(record.moderationStatus))) throw new Error("MODERATION_HOLD_REQUIRED");
      const [account, profile] = await Promise.all([tx.get(db.collection("users").doc(ownerId)), tx.get(db.collection("profiles").doc(ownerId))]);
      if (publicationSafetyHold({ ...profile.data(), ...account.data() }, {})) throw new Error("ACCOUNT_RESTRICTION_UNRESOLVED");
      if (record.publishedAt) {
        if (source === "tournaments") {
          const funding = await getTournamentCreatorFunding(db, target.id, record, tx);
          if (Number(record.basePrizeAmountMinor ?? 0) > funding.confirmedCreatorCents || funding.reviewCount > 0) throw new Error("BASE_PRIZE_FUNDING_REQUIRED");
        } else await requireConfirmedPublicationFunding(db, tx, target.id, record, record);
      }
      Object.assign(update, { moderationStatus: "clear", safetyHold: false, ...(record.fraudConfirmed === true ? { fraudConfirmed: false } : {}), publicationOutcome: record.publishedAt ? "published" : "needs_attention", publicVisibility: record.publishedAt ? record.preModerationPublicVisibility !== false : false });
    } else if (input.action !== "dismiss") {
      Object.assign(update, { moderationStatus: input.action === "remove" ? "removed" : "held", publicVisibility: false, preModerationPublicVisibility: record.preModerationPublicVisibility ?? record.publicVisibility ?? true, moderationReason: input.reason });
    }
    if (Object.keys(update).length) {
      update.updatedAt = now;
      tx.update(targetRef, update);
      if (record.isLiveEvent) tx.set(db.collection("liveEvents").doc(target.id), update, { merge: true });
    }
    const version = Number(row.version ?? 0) + 1;
    tx.update(caseRef, { status: ["release", "dismiss"].includes(input.action) ? "resolved" : "investigating", resolution: input.action, reason: input.reason, reviewedBy: input.actorId, version, updatedAt: now });
    tx.create(db.collection("auditLogs").doc(`moderation_${input.caseId}_${version}`), { targetId: target.id, source, caseId: input.caseId, actorId: input.actorId, action: `challenge.moderation.${input.action}`, reason: input.reason, before: { moderationStatus: record.moderationStatus ?? "clear", fraudConfirmed: record.fraudConfirmed === true }, after: update, createdAt: now });
    if (ownerId && input.action !== "dismiss") tx.set(db.collection("notifications").doc(`moderation_${input.caseId}_${version}`), { userId: ownerId, type: "challenge_moderation", title: input.action === "release" ? "Moderation restriction resolved" : "Challenge moderation update", body: input.reason, targetId: target.id, actionUrl: "/support/new", read: false, createdAt: now });
    return { action: input.action, status: update.moderationStatus ?? record.moderationStatus ?? "clear" };
  });
}
