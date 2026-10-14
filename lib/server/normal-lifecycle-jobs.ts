import type { Firestore } from "firebase-admin/firestore";
import { isEnteredParticipantStatus } from "@/lib/server/submission-lifecycle";
import { normalModerationPending, normalTimestamp, normalVotingSchedule, NORMAL_APPEAL_WINDOW_MS, NORMAL_REVIEW_ESCALATION_MS } from "@/lib/server/normal-lifecycle-policy";
import { queueNormalLifecycleRefunds } from "@/lib/server/normal-refunds";

const terminal = new Set(["draft", "pending_review", "cancelled", "canceled", "paused", "completed", "winners_announced"]);

/** Every decision rereads its inputs transactionally. Repeated invocations resume persisted work. */
export async function processNormalChallengeLifecycle(db: Firestore, challengeId: string, clock: Date | (() => Date) = () => new Date()) {
  const now = clock instanceof Date ? clock : clock();
  const challengeRef = db.collection("challenges").doc(challengeId);
  const initial = await challengeRef.get();
  if (initial.exists && initial.data()?.normalLifecyclePolicyVersion === 1) await queueNormalLifecycleRefunds(db, challengeId, now);
  if (!initial.exists || initial.data()?.builderVersion !== "normal_v3" || initial.data()?.normalLifecyclePolicyVersion !== 1 || terminal.has(String(initial.data()?.status))) return { skipped: true };
  const submissions = await db.collection("submissions").where("challengeId", "==", challengeId).get();
  for (const document of submissions.docs) {
    await db.runTransaction(async transaction => {
      const [currentChallenge, current, safety] = await Promise.all([transaction.get(challengeRef), transaction.get(document.ref), transaction.get(db.collection("submissionSafetyReviews").doc(document.id))]);
      if (!current.exists || !currentChallenge.exists || terminal.has(String(currentChallenge.data()?.status))) return;
      const data = current.data() ?? {};
      const participant = await transaction.get(db.collection("challengeParticipants").doc(`${challengeId}_${String(data.userId)}`));
      const correctionTaskRef = db.collection("adminActionTasks").doc(`normal_correction_${document.id}_${data.revisionNumber}`);
      const initialTaskRef = db.collection("adminActionTasks").doc(`normal_initial_review_${document.id}`);
      const [correctionTask, initialTask] = await Promise.all([transaction.get(correctionTaskRef), transaction.get(initialTaskRef)]);
      const paidEntry = currentChallenge.data()?.paidEntryEnabled || (currentChallenge.data()?.monetization as Record<string, unknown> | undefined)?.paidEntryRequested;
      const admittedParticipant = participant.exists && isEnteredParticipantStatus(participant.data()?.status) && (!paidEntry || ["paid", "confirmed"].includes(String(participant.data()?.entryPaymentStatus)));
      const status = String(data.status);
      const iso = now.toISOString();
      const auditRef = db.collection("auditLogs").doc(`normal_${document.id}_${data.revisionNumber ?? 0}_${status}`);
      if (status === "resubmission_requested" && normalTimestamp(data.resubmissionDeadline) <= now.getTime()) {
        const update = { status: "rejected", moderationStatus: "rejected", finalRejectedAt: iso, appealDeadline: new Date(now.getTime() + NORMAL_APPEAL_WINDOW_MS).toISOString(), rejectionReason: data.requestedChanges ?? data.rejectionReason ?? "The correction opportunity expired without a submission.", leaderboardEligible: false, publicEligible: false, updatedAt: iso };
        transaction.update(document.ref, update);
        transaction.create(auditRef, { action: "normal.correction_expired", actorId: "system_normal_lifecycle", targetId: document.id, challengeId, before: { status }, after: update, createdAt: iso });
      } else if (status === "pending_review" && data.resubmissionCompletedAt && normalTimestamp(data.correctionAutoReviewAt) <= now.getTime()) {
        const review = safety.data() ?? {};
        const clean = admittedParticipant && safety.exists && review.status === "clean" && review.trusted === true && Number(review.revisionNumber) === Number(data.revisionNumber) && review.mediaStoragePath === data.mediaStoragePath && data.serverMediaVerifiedAt && !data.flagReason && data.safetyReviewStatus !== "flagged";
        if (clean) {
          const update = { status: "approved", moderationStatus: "approved", approvedAt: iso, reviewedAt: iso, reviewedBy: "system_normal_lifecycle", safetyReviewStatus: "clean", leaderboardEligible: true, publicEligible: true, leaderboardSortAt: iso, updatedAt: iso };
          transaction.update(document.ref, update);
          transaction.create(auditRef, { action: "normal.correction_auto_approved", actorId: "system_normal_lifecycle", targetId: document.id, challengeId, revisionNumber: data.revisionNumber, safetyReviewId: safety.id, before: { status }, after: update, createdAt: iso });
        } else {
          if (!correctionTask.exists) transaction.create(correctionTaskRef, { type: "normal_correction_safety_review", challengeId, submissionId: document.id, status: "open", reason: "Trusted clean safety evidence for the current correction is required.", createdAt: iso });
        }
      } else if (["submitted", "pending_review"].includes(status) && !data.resubmissionCompletedAt && normalTimestamp(data.submittedAt ?? data.createdAt) + NORMAL_REVIEW_ESCALATION_MS < now.getTime()) {
        if (!initialTask.exists) transaction.create(initialTaskRef, { type: "normal_initial_moderation_overdue", priority: "urgent", status: "open", challengeId, submissionId: document.id, reason: "Initial moderation has remained unresolved for more than 24 hours.", createdAt: iso });
      }
    });
  }
  return db.runTransaction(async transaction => {
    const [snap, entries, participants, votes] = await Promise.all([
      transaction.get(challengeRef), transaction.get(db.collection("submissions").where("challengeId", "==", challengeId)), transaction.get(db.collection("challengeParticipants").where("challengeId", "==", challengeId)), transaction.get(db.collection("votes").where("challengeId", "==", challengeId)),
    ]);
    if (!snap.exists || snap.data()?.builderVersion !== "normal_v3" || terminal.has(String(snap.data()?.status))) return { skipped: true };
    const challenge = snap.data() ?? {};
    const decisionNow = clock instanceof Date ? clock : clock();
    const iso = decisionNow.toISOString();
    if (!(normalTimestamp(challenge.submissionDeadline) <= decisionNow.getTime())) {
      const registrationOpen = normalTimestamp(challenge.registrationOpensAt) <= decisionNow.getTime() && normalTimestamp(challenge.registrationDeadline) > decisionNow.getTime();
      const submissionOpen = normalTimestamp(challenge.submissionStartAt ?? challenge.startsAt) <= decisionNow.getTime();
      const status = submissionOpen ? "submission_open" : registrationOpen ? "registration_open" : "scheduled";
      if (challenge.status !== status) {
        transaction.update(challengeRef, { status, lifecycleStatus: status, updatedAt: iso });
        transaction.set(db.collection("normalLifecycleEvents").doc(`${challengeId}_${status}`), { challengeId, action: status, actorId: "system_normal_lifecycle", createdAt: iso }, { merge: true });
      }
      return { waiting: "submission_deadline" };
    }
    const records = entries.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
    const admitted = new Map(participants.docs.map(doc => [String(doc.data().userId), doc.data()]));
    const eligible = records.filter(entry => {
      const participant = admitted.get(String(entry.userId));
      const monetization = challenge.monetization as Record<string, unknown> | undefined;
      const paidEntry = participant?.paidEntryEnabled || challenge.paidEntryEnabled || monetization?.paidEntryRequested;
      return participant && isEnteredParticipantStatus(participant.status) && ["approved", "active"].includes(String(entry.status)) && !["flagged", "rejected", "disqualified"].includes(String(entry.moderationStatus)) && (!paidEntry || ["paid", "confirmed"].includes(String(participant.entryPaymentStatus)));
    });
    if (!challenge.effectiveVotingStartsAt) {
      if (records.some(entry => {
        const participant = admitted.get(String(entry.userId));
        return !participant || (isEnteredParticipantStatus(participant.status) && normalModerationPending(entry, decisionNow));
      })) {
        transaction.update(challengeRef, { normalVotingGate: "moderation_pending", normalLifecycleCheckedAt: iso });
        return { waiting: "moderation_or_appeal" };
      }
      if (eligible.length) {
        const schedule = normalVotingSchedule(challenge, decisionNow);
        if (!schedule) return { waiting: "configured_voting_start" };
        const update = { ...schedule, votingStartsAt: schedule.effectiveVotingStartsAt, votingDeadline: schedule.effectiveVotingEndsAt, votingEndsAt: schedule.effectiveVotingEndsAt, normalVotingGate: "ready", status: "voting_open", updatedAt: iso };
        transaction.update(challengeRef, update);
        transaction.create(db.collection("normalLifecycleEvents").doc(`${challengeId}_voting_opened`), { challengeId, action: "voting_opened", actorId: "system_normal_lifecycle", before: { votingStartsAt: challenge.votingStartsAt ?? null, votingDeadline: challenge.votingDeadline ?? null }, after: update, createdAt: iso });
        transaction.create(db.collection("normalNotificationOutbox").doc(`${challengeId}_voting_opened`), { challengeId, creatorId: challenge.creatorId ?? challenge.ownerId ?? null, type: "normal_voting_schedule", title: "Voting is open", message: `Voting begins ${schedule.effectiveVotingStartsAt} and ends ${schedule.effectiveVotingEndsAt} (UTC). The full configured voting duration is preserved.`, effectiveVotingStartsAt: schedule.effectiveVotingStartsAt, effectiveVotingEndsAt: schedule.effectiveVotingEndsAt, status: "pending", cursor: null, createdAt: iso });
        return { votingOpened: true };
      }
    } else {
      const votingEnd = normalTimestamp(challenge.effectiveVotingEndsAt);
      const votingStart = normalTimestamp(challenge.effectiveVotingStartsAt);
      if (!Number.isFinite(votingEnd) || !Number.isFinite(votingStart) || votingEnd <= votingStart) return { waiting: "invalid_voting_schedule" };
      if (votingEnd > decisionNow.getTime()) return { waiting: "voting_end" };
    }
    const totals = new Map<string, number>();
    for (const vote of votes.docs) {
      const data = vote.data();
      const quantity = Number(data.quantity ?? 1);
      if (data.status === "counted" && data.reversed !== true && data.invalidated !== true && Number.isSafeInteger(quantity) && quantity > 0) totals.set(String(data.submissionId), (totals.get(String(data.submissionId)) ?? 0) + quantity);
    }
    const candidates = eligible.filter(entry => (totals.get(String(entry.id)) ?? 0) > 0).map(entry => ({ submissionId: String(entry.id), userId: String(entry.userId), validVotes: totals.get(String(entry.id)) ?? 0 })).sort((a, b) => b.validVotes - a.validVotes || a.submissionId.localeCompare(b.submissionId));
    const eventRef = db.collection("normalLifecycleEvents").doc(`${challengeId}_voting_finalized`);
    const prior = await transaction.get(eventRef);
    if (prior.exists) return { idempotent: true };
    if (!candidates.length) {
      transaction.update(challengeRef, { status: "completed", normalOutcome: "no_winners", outcomeReason: eligible.length ? "no_valid_votes" : "no_approved_submissions", completedAt: iso, normalVotingGate: "closed", financialResolutionStatus: "held_for_admin_review", settlementRestricted: true, updatedAt: iso });
      transaction.set(db.collection("adminActionTasks").doc(`normal_no_winners_${challengeId}`), { type: "normal_no_winners_funding_reconciliation", challengeId, status: "open", reason: "Preserve confirmed funds and reconcile approved refund liabilities. No automatic redistribution.", createdAt: iso });
    } else transaction.update(challengeRef, { status: "under_review", normalVotingGate: "closed", finalVoteSnapshotId: eventRef.id, finalVoteSnapshotAt: iso, updatedAt: iso });
    transaction.create(eventRef, { challengeId, action: candidates.length ? "winner_review_ready" : "no_winners", actorId: "system_normal_lifecycle", candidates, immutable: true, createdAt: iso });
    transaction.create(db.collection("normalNotificationOutbox").doc(`${challengeId}_voting_finalized`), {
      challengeId, creatorId: challenge.creatorId ?? challenge.ownerId ?? null,
      type: candidates.length ? "normal_results_review" : "normal_no_winners",
      title: candidates.length ? "Voting has ended" : "Challenge completed — No Winners",
      message: candidates.length ? "Final votes are recorded. Results remain pending authorized Admin review; no winners or payouts have been announced." : "This challenge completed without eligible winners. No winner payout has been initiated; confirmed funds remain subject to financial reconciliation.",
      status: "pending", cursor: null, createdAt: iso,
    });
    return { noWinners: !candidates.length, candidateCount: candidates.length };
  });
}
