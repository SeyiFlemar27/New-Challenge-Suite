import type { Firestore } from "firebase-admin/firestore";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";
import { queueNormalLifecycleRefunds } from "@/lib/server/normal-refunds";
import { runFinancialTransaction } from "@/lib/server/financial-transaction";
export async function disqualifyNormalParticipant(db: Firestore, input: { participantId: string; adminId: string; reason: string; confirmed: boolean; now?: Date }) {
  if (!input.confirmed || !input.reason.trim()) throw new Error("CONFIRMATION_AND_REASON_REQUIRED");
  const now = input.now ?? new Date();
  const result = await runFinancialTransaction(db, async transaction => {
    const participantRef = db.collection("challengeParticipants").doc(input.participantId);
    const participant = await transaction.get(participantRef);
    if (!participant.exists) throw new Error("NOT_FOUND");
    const data = participant.data() ?? {};
    const challengeRef = db.collection("challenges").doc(String(data.challengeId));
    const challenge = await transaction.get(challengeRef);
    if (!challenge.exists || challenge.data()?.builderVersion !== "normal_v3") throw new Error("NORMAL_CHALLENGE_REQUIRED");
    if (data.status === "disqualified") return { challengeId: challenge.id, duplicate: true, finalized: Boolean(challenge.data()?.settlementId || challenge.data()?.winnersApprovedAt) };
    const finalized = Boolean(challenge.data()?.settlementId || challenge.data()?.winnersApprovedAt);
    const earnings = finalized ? await transaction.get(db.collection("cashLedger").where("challengeId", "==", challenge.id).where("userId", "==", data.userId)) : null;
    const iso = now.toISOString();
    transaction.update(participantRef, { status: "disqualified", disqualifiedAt: iso, disqualifiedBy: input.adminId, disqualificationReason: input.reason, updatedAt: iso });
    if (finalized) {
      for (const earning of earnings?.docs ?? []) if (earning.data().userId === data.userId && earning.data().direction === "credit" && !["paid_out", "paid"].includes(String(earning.data().status)) && earning.data().externalPayoutExecuted !== true) transaction.update(earning.ref, { disputeRestricted: true, financialRestrictionReason: "post_finalization_disqualification", updatedAt: iso });
      transaction.set(db.collection("adminActionTasks").doc(`normal_finalized_disqualification_${participant.id}`), { type: "normal_finalized_disqualification_reconciliation", challengeId: challenge.id, participantId: participant.id, userId: data.userId, status: "open", reason: input.reason, completedPayoutsPreserved: true, createdAt: iso }, { merge: true });
    }
    if (challenge.data()?.normalLifecyclePolicyVersion === 1) wakeNormalLifecycleJob(db, transaction, challenge.id, iso);
    transaction.create(db.collection("auditLogs").doc(), { actorId: input.adminId, actorType: "admin", action: "normal.participant_disqualified", challengeId: challenge.id, targetId: participant.id, reason: input.reason, before: { status: data.status }, after: { status: "disqualified", unpaidEntitlementsHeld: finalized }, completedPayoutsPreserved: true, createdAt: iso });
    return { challengeId: challenge.id, duplicate: false, finalized };
  });
  if (!result.finalized) await queueNormalLifecycleRefunds(db, result.challengeId, now);
  return result;
}
