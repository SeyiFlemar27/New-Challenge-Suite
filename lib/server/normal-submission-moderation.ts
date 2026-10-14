import type { Firestore } from "firebase-admin/firestore";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { resolveResubmissionDeadline } from "@/lib/server/submission-resubmission";
import { isEnteredParticipantStatus } from "@/lib/server/submission-lifecycle";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";
export async function moderateNormalSubmission(db: Firestore, input: { challengeId: string; submissionId: string; actorId: string; admin: boolean; enterpriseAuthorized?: boolean; action: "approve" | "reject" | "flag"; reason: string; expectedUpdatedAt?: unknown; now?: Date }) {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  if (input.action !== "approve" && !input.reason.trim()) throw new Error("MODERATION_REASON_REQUIRED");
  return db.runTransaction(async transaction => {
    const ref = db.collection("submissions").doc(input.submissionId);
    const challengeRef = db.collection("challenges").doc(input.challengeId);
    const [submission, challenge] = await Promise.all([transaction.get(ref), transaction.get(challengeRef)]);
    const data = submission.data() ?? {};
    const record = challenge.data() ?? {};
    if (!submission.exists || !challenge.exists || data.challengeId !== input.challengeId || record.builderVersion !== "normal_v3") throw new Error("NOT_FOUND");
    if (!input.admin && !input.enterpriseAuthorized && !userOwnsChallenge(record, input.actorId)) throw new Error("PERMISSION_DENIED");
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== data.updatedAt) throw new Error("MODERATION_STATE_CHANGED");
    if (record.effectiveVotingStartsAt || record.winnersApprovedAt || ["paused", "cancelled", "completed", "winners_announced"].includes(String(record.status)) || ["disqualified", "withdrawn", "winner"].includes(String(data.status))) throw new Error("MODERATION_STATE_LOCKED");
    if (data.finalRejectedAt && input.action === "approve") throw new Error("FINAL_REJECTION_REQUIRES_APPEAL_REVIEW");
    if (input.action === "reject" && data.status === "resubmission_requested" && !data.resubmissionCompletedAt && now.getTime() < normalTimestamp(data.resubmissionDeadline)) throw new Error("CORRECTION_WINDOW_ACTIVE");
    const participant = await transaction.get(db.collection("challengeParticipants").doc(`${input.challengeId}_${String(data.userId)}`));
    const paidEntry = record.paidEntryEnabled || (record.monetization as Record<string, unknown> | undefined)?.paidEntryRequested;
    if (input.action === "approve" && (!participant.exists || !isEnteredParticipantStatus(participant.data()?.status) || (paidEntry && !["paid", "confirmed"].includes(String(participant.data()?.entryPaymentStatus))))) throw new Error("PARTICIPANT_NOT_ELIGIBLE");
    let status: string = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "flagged";
    const update: Record<string, unknown> = { status, moderationStatus: status, reviewedBy: input.actorId, reviewedAt: iso, leaderboardEligible: input.action === "approve", publicEligible: input.action === "approve", updatedAt: iso };
    if (input.action === "reject" && !data.resubmissionRequestId && !data.resubmissionCompletedAt) {
      const deadline = resolveResubmissionDeadline({ requestedDeadline: null, challenge: record, now });
      if (!deadline.allowed) throw new Error("MODERATION_STATE_LOCKED");
      status = "resubmission_requested";
      Object.assign(update, { status, moderationStatus: status, resubmissionRequestId: `normal_${input.submissionId}_${data.revisionNumber ?? 0}`, resubmissionDeadline: deadline.deadline, resubmissionRequestedAt: iso, requestedChanges: input.reason, rejectionReason: input.reason, rejectedAt: iso, resubmissionCompletedRequestId: null });
    } else if (input.action === "reject") Object.assign(update, { rejectionReason: input.reason, rejectedAt: iso, finalRejectedAt: iso, appealDeadline: new Date(now.getTime() + 24 * 60 * 60_000).toISOString() });
    if (input.action === "flag") Object.assign(update, { flagReason: input.reason, flaggedAt: iso });
    if (input.action === "approve") Object.assign(update, { approvedAt: iso, flagReason: null, rejectionReason: null, leaderboardSortAt: data.scoreReachedAt ?? iso });
    transaction.update(ref, update);
    transaction.update(challengeRef, { normalVotingGate: "moderation_pending", updatedAt: iso });
    if (record.normalLifecyclePolicyVersion === 1) wakeNormalLifecycleJob(db, transaction, input.challengeId, iso);
    transaction.create(db.collection("auditLogs").doc(), { actorId: input.actorId, actorType: input.admin ? "admin" : "creator", action: `normal.submission.${input.action}`, targetId: input.submissionId, challengeId: input.challengeId, reason: input.reason || "Submission approved after review.", before: { status: data.status, revisionNumber: data.revisionNumber ?? 0 }, after: update, createdAt: iso });
    return { status, update };
  });
}
