import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireAdminUser(request);
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

  const now = new Date().toISOString();
  const preview = await buildConfirmedSettlementPreview(db, { challengeId, challenge, winners });
  const adminNote = typeof parsed.body?.adminNote === "string" ? parsed.body.adminNote.trim().slice(0, 2000) : "";
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
    kycStillRequiredBeforeWithdrawal: true,
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
      kycStillRequiredBeforeWithdrawal: true
    }
  }, db);

  return ok({
    proposal: { ...proposal, ...update, settlementId: settlement.settlement.id, settlementStatus: settlement.settlement.status },
    preview,
    settlement
  }, settlement.idempotent
    ? "Winners were already approved and the existing internal settlement was returned."
    : "Winners approved and internal settlement created. External payout remains pending review.");
}
