import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  buildLedgerFinalizationFoundation,
  buildPrizeApprovalPreview,
  getChallengeOrNull,
  getProposalOrNull,
  normalizeWinnerProposalWinners,
  validateWinnerProposalWinners
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
  if (proposal.status === "approved") {
    return ok({ proposal, idempotent: true, payoutProviderCalled: false, ledgerEntriesCreated: false }, "Winner proposal was already approved. No payout provider was called.");
  }

  const winners = normalizeWinnerProposalWinners(proposal.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return validationError(validation.errors, "Winner proposal split is invalid.");

  const now = new Date().toISOString();
  const preview = buildPrizeApprovalPreview({ challengeId, proposalId, challenge, winners, approvedAt: now });
  const ledgerFinalization = buildLedgerFinalizationFoundation({ challengeId, proposalId, adminId: user.uid, preview });
  const adminNote = typeof parsed.body?.adminNote === "string" ? parsed.body.adminNote.trim().slice(0, 2000) : "";
  const update = {
    status: "approved",
    reviewedAt: now,
    reviewedByAdminId: user.uid,
    adminDecision: "approved",
    adminNote,
    ledgerPreview: preview,
    payoutPreviewId: preview.id,
    ledgerFinalization,
    ledgerFinalizationStatus: ledgerFinalization.status,
    ledgerEntriesCreated: false,
    cashBalancesCredited: false,
    payoutProviderCalled: false,
    payoutMarkedPaid: false,
    payoutExecutionEnabled: false,
    kycStillRequiredBeforeWithdrawal: true,
    holdHours: preview.holdHours,
    holdUntil: preview.holdUntil,
    updatedAt: now
  };

  await db.collection("winnerProposals").doc(proposalId).set(update, { merge: true });
  await writeAuditLog({
    actorId: user.uid,
    actorType: "admin",
    action: "winner.reviewed",
    targetType: "winner",
    targetId: proposalId,
    reason: "Winner proposal approved for ledger-finalization foundation. No payout execution was performed.",
    metadata: {
      challengeId,
      ledgerFinalizationStatus: ledgerFinalization.status,
      confirmedPrizePoolCents: preview.totalWinnerPrizePoolCents,
      payoutProviderCalled: false,
      ledgerEntriesCreated: false,
      kycStillRequiredBeforeWithdrawal: true
    }
  }, db);

  return ok({ proposal: { ...proposal, ...update }, preview, ledgerFinalization }, preview.ledgerFinalizationAvailable ? "Winner proposal approved. Ledger finalization foundation is prepared; no payout provider was called." : "Winner proposal approved. Ledger finalization remains blocked until confirmed payment sources exist.");
}
