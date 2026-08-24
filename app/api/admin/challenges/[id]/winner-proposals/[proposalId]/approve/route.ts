import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  buildConfirmedSettlementPreview,
  createInternalChallengeSettlement
} from "@/lib/server/challenge-settlement";
import {
  getChallengeOrNull,
  getProposalOrNull,
  getWinnerCandidates,
  normalizeWinnerProposalWinners,
  validateWinnerProposalWinners,
  winnerProposalLifecycleReadiness
} from "@/lib/server/prize-approvals";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";
import { deterministicId } from "@/lib/server/idempotency";
import { createNotification } from "@/lib/server/notifications";
import { grantRewardPointsForEvent, type RewardableEventType } from "@/lib/server/reward-economy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "settlements.approve");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize approval");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { id: challengeId, proposalId } = await params;
  const [challenge, proposal] = await Promise.all([
    getChallengeOrNull(db, challengeId),
    getProposalOrNull(db, proposalId)
  ]);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  if (!proposal || String(proposal.challengeId) !== challengeId) return fail("Winner proposal not found.", 404, undefined, "WINNER_PROPOSAL_NOT_FOUND");
  const winners = normalizeWinnerProposalWinners(proposal.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return validationError(validation.errors, "Winner proposal split is invalid.");
  const readiness = winnerProposalLifecycleReadiness(challenge);
  if (proposal.status !== "approved" && !readiness.ready) {
    return fail(readiness.message, 409, readiness, "WINNER_APPROVAL_NOT_READY");
  }
  const candidates = await getWinnerCandidates(db, challengeId);
  const eligible = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const ineligibleWinner = winners.find((winner) => {
    const candidate = eligible.get(winner.userId);
    return !candidate || (winner.submissionId && candidate.submissionId !== winner.submissionId);
  });
  if (ineligibleWinner) {
    return fail("Every approved winner must have an eligible challenge submission.", 409, {
      userId: ineligibleWinner.userId,
      submissionId: ineligibleWinner.submissionId
    }, "WINNER_NOT_ELIGIBLE");
  }
  const adminNote = typeof parsed.body?.adminNote === "string" ? parsed.body.adminNote.trim().slice(0, 2000) : "";
  const selectedIds = new Set(winners.map((winner) => winner.userId));
  const selectedScores = candidates.filter((candidate) => selectedIds.has(candidate.userId)).map((candidate) => candidate.weightedVoteCount);
  const unselectedScores = candidates.filter((candidate) => !selectedIds.has(candidate.userId)).map((candidate) => candidate.weightedVoteCount);
  const tieAtWinnerBoundary = selectedScores.some((score) => unselectedScores.includes(score));
  const configuredTieBreaker = Boolean(challenge.tieBreaker || challenge.tieBreakerRule || challenge.winnerTieBreaker);
  if (tieAtWinnerBoundary && !configuredTieBreaker && !adminNote) {
    return fail("Tied winner candidates require an explicit admin review note.", 409, {
      tieRequiresAdminReview: true,
      tiedScores: [...new Set(selectedScores.filter((score) => unselectedScores.includes(score)))]
    }, "WINNER_TIE_REQUIRES_ADMIN_REVIEW");
  }

  const now = new Date().toISOString();
  const preview = await buildConfirmedSettlementPreview(db, { challengeId, challenge, winners });
  const update = {
    status: "approved",
    reviewedAt: now,
    reviewedByAdminId: user.uid,
    adminDecision: "approved",
    adminNote,
    settlementPreview: preview,
    ledgerFinalizationStatus: "creating_internal_settlement",
    payoutProviderCalled: false,
    payoutMarkedPaid: false,
    payoutExecutionEnabled: false,
    kycStillRequiredBeforeWithdrawal: false,
    updatedAt: now
  };

  if (proposal.status !== "approved") {
    await db.collection("winnerProposals").doc(proposalId).set(update, { merge: true });
  }
  const settlement = await createInternalChallengeSettlement(db, {
    challengeId,
    proposalId,
    adminId: user.uid,
    challenge,
    winners,
    approvedAt: proposal.status === "approved" && typeof proposal.reviewedAt === "string" ? proposal.reviewedAt : now
  });
  await writeAuditLog({
    actorId: user.uid,
    actorType: "admin",
    action: "winner.reviewed",
    targetType: "winner",
    targetId: proposalId,
    reason: "Winner proposal approved and internal settlement prepared. No external payout was executed.",
    metadata: {
      challengeId,
      settlementId: settlement.settlement.id,
      settlementStatus: settlement.settlement.status,
      grossConfirmedChallengeRevenue: preview.grossConfirmedChallengeRevenue,
      grossConfirmedSponsorPrizeAmount: preview.grossConfirmedSponsorPrizeAmount,
      payoutProviderCalled: false,
      walletCreditsCreated: settlement.walletCreditsCreated,
      kycStillRequiredBeforeWithdrawal: false
    }
  }, db);

  if (!isPaidEntryChallenge(challenge)) {
    const winnerIds = new Set(winners.map((winner) => winner.userId));
    const rewardJobs = [
      ...winners.map((winner) => awardDoroCoinEngagement(db, { userId: winner.userId, sourceType: "win_free_challenge" as const, actionId: challengeId, challengeId })),
      ...candidates.slice(0, 10).map((candidate) => awardDoroCoinEngagement(db, { userId: candidate.userId, sourceType: "top_10_finish" as const, actionId: challengeId, challengeId, suspiciousSignals: winnerIds.has(candidate.userId) ? ["winner_and_top_10_rewards_are_separate_rules"] : [] }))
    ];
    const rewardResults = await Promise.allSettled(rewardJobs);
    if (rewardResults.some((result) => result.status === "rejected")) {
      await db.collection("adminActionTasks").doc(deterministicId("doro_results_failure", challengeId, proposalId)).set({ type: "dorocoin_reward_delivery_failure", sourceType: "approved_free_challenge_results", challengeId, proposalId, status: "open", failureCount: rewardResults.filter((result) => result.status === "rejected").length, createdAt: now }, { merge: true });
    }
  }
  const creatorId = String(challenge.creatorId ?? challenge.ownerId ?? challenge.hostId ?? "");
  if (creatorId) await createNotification(db, { userId: creatorId, type: "winner_proposal_approved", title: "Winner proposal approved", body: `Official winners for ${String(challenge.title ?? "your challenge")} were approved.`, entityType: "winner_proposal", entityId: proposalId, targetId: proposalId, actionUrl: `/challenges/${challengeId}/manage?tab=winners&focus=${encodeURIComponent(proposalId)}`, metadata: { challengeId, proposalId }, idempotencyKey: `winner_proposal_approved_${proposalId}` }).catch(() => undefined);

  if (proposal.status !== "approved") {
    const challengeType = String(challenge.challengeType ?? challenge.type ?? "normal").toLowerCase();
    const individualTournament = challengeType.includes("tournament") && challenge.teamBased !== true;
    const completionJobs = candidates.map((candidate) => grantRewardPointsForEvent(db, { userId: candidate.userId, eventType: "challenge_participation_completed", sourceId: challengeId, sourceEventKey: `challenge-completed:${challengeId}:${candidate.userId}`, metadata: { proposalId } }));
    const placementJobs = winners.map((winner) => {
      const placement = Number(winner.placement ?? 0);
      const eventType = individualTournament
        ? (placement === 1 ? "individual_tournament_champion" : undefined)
        : ({ 1: "challenge_first_place", 2: "challenge_second_place", 3: "challenge_third_place" } as Record<number, RewardableEventType>)[placement];
      return eventType ? grantRewardPointsForEvent(db, { userId: winner.userId, eventType, sourceId: challengeId, sourceEventKey: `placement:${challengeId}:${winner.userId}:${placement}`, metadata: { placement, proposalId } }) : Promise.resolve(null);
    });
    const rewardResults = await Promise.allSettled([...completionJobs, ...placementJobs]);
    if (rewardResults.some((item) => item.status === "rejected")) await db.collection("adminActionTasks").doc(deterministicId("reward_results_failure", challengeId, proposalId)).set({ type: "reward_delivery_failure", rewardEventType: "challenge_results", challengeId, proposalId, status: "open", createdAt: now }, { merge: true });
  }

  return ok({
    proposal: { ...proposal, ...update, settlementId: settlement.settlement.id, settlementStatus: settlement.settlement.status },
    preview,
    settlement
  }, settlement.idempotent
    ? "Winners were already approved and the existing internal settlement was returned."
    : "Winners approved and internal settlement created. External payout remains pending review.");
}
