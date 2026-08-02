import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { buildConfirmedSettlementPreview } from "@/lib/server/challenge-settlement";
import { getChallengeOrNull, getProposalOrNull, normalizeWinnerProposalWinners, validateWinnerProposalWinners } from "@/lib/server/prize-approvals";
import { fail, ok, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { response } = await requireAdminPermission(request, "finance.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize approval preview");
  const { id: challengeId, proposalId } = await params;
  const [challenge, proposal] = await Promise.all([
    getChallengeOrNull(db, challengeId),
    getProposalOrNull(db, proposalId)
  ]);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  if (!proposal || proposal.challengeId !== challengeId) return fail("Winner proposal not found.", 404, undefined, "WINNER_PROPOSAL_NOT_FOUND");

  const winners = normalizeWinnerProposalWinners(proposal.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return validationError(validation.errors, "Winner proposal split is invalid.");

  const preview = await buildConfirmedSettlementPreview(db, { challengeId, challenge, winners });
  return ok({ preview }, preview.status === "ready_for_admin_approval"
    ? "Settlement preview prepared from confirmed payment records."
    : "No confirmed payment records are available for settlement.");
}
