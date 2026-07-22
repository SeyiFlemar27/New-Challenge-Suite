import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { getChallengeOrNull, getProposalOrNull } from "@/lib/server/prize-approvals";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize change request");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const adminNote = typeof parsed.body?.adminNote === "string" ? parsed.body.adminNote.trim().slice(0, 2000) : "";
  if (!adminNote) return validationError({ adminNote: "Enter the requested changes." });
  const { id: challengeId, proposalId } = await params;
  const [challenge, proposal] = await Promise.all([
    getChallengeOrNull(db, challengeId),
    getProposalOrNull(db, proposalId)
  ]);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  if (!proposal || String(proposal.challengeId) !== challengeId) return fail("Winner proposal not found.", 404, undefined, "WINNER_PROPOSAL_NOT_FOUND");

  const now = new Date().toISOString();
  const update = {
    status: "changes_requested",
    reviewedAt: now,
    reviewedByAdminId: user.uid,
    adminDecision: "changes_requested",
    adminNote,
    ledgerFinalizationStatus: "changes_requested_no_ledger_entries",
    ledgerEntriesCreated: false,
    cashBalancesCredited: false,
    payoutProviderCalled: false,
    payoutMarkedPaid: false,
    updatedAt: now
  };
  await db.collection("winnerProposals").doc(proposalId).set(update, { merge: true });
  await writeAuditLog({
    actorId: user.uid,
    actorType: "admin",
    action: "winner.reviewed",
    targetType: "winner",
    targetId: proposalId,
    reason: "Changes requested for winner proposal. No ledger entries were created.",
    metadata: { challengeId, payoutProviderCalled: false, ledgerEntriesCreated: false }
  }, db);

  return ok({ proposal: { ...proposal, ...update } }, "Changes requested. No ledger entries were created.");
}
