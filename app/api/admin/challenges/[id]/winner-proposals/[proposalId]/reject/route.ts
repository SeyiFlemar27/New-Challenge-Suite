import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { getChallengeOrNull, getProposalOrNull } from "@/lib/server/prize-approvals";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { createNotification } from "@/lib/server/notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "winners.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin prize rejection");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const adminNote = typeof parsed.body?.adminNote === "string" ? parsed.body.adminNote.trim().slice(0, 2000) : "";
  if (!adminNote) return validationError({ adminNote: "Enter a rejection reason." });
  const { id: challengeId, proposalId } = await params;
  const [challenge, proposal] = await Promise.all([
    getChallengeOrNull(db, challengeId),
    getProposalOrNull(db, proposalId)
  ]);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  if (!proposal || String(proposal.challengeId) !== challengeId) return fail("Winner proposal not found.", 404, undefined, "WINNER_PROPOSAL_NOT_FOUND");

  const now = new Date().toISOString();
  const changesRequested = parsed.body?.decision === "changes_requested" || parsed.body?.requestChanges === true;
  const update = {
    status: changesRequested ? "changes_requested" : "rejected",
    reviewedAt: now,
    reviewedByAdminId: user.uid,
    adminDecision: changesRequested ? "changes_requested" : "rejected",
    adminNote,
    ledgerFinalizationStatus: "rejected_no_ledger_entries",
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
    reason: "Winner proposal rejected. No ledger entries were created.",
    metadata: { challengeId, payoutProviderCalled: false, ledgerEntriesCreated: false }
  }, db);
  const creatorId = String(challenge.creatorId ?? challenge.ownerId ?? challenge.hostId ?? "");
  if (creatorId) await createNotification(db, { userId: creatorId, type: changesRequested ? "winner_proposal_changes_requested" : "winner_proposal_rejected", title: changesRequested ? "Winner proposal needs changes" : "Winner proposal not approved", body: adminNote, entityType: "winner_proposal", entityId: proposalId, targetId: proposalId, actionUrl: `/challenges/${challengeId}/manage?tab=winners&focus=${encodeURIComponent(proposalId)}`, metadata: { challengeId, proposalId }, idempotencyKey: `winner_proposal_${changesRequested ? "changes" : "rejected"}_${proposalId}_${now}` }).catch(() => undefined);

  return ok({ proposal: { ...proposal, ...update } }, changesRequested ? "Winner proposal changes requested. No ledger entries were created." : "Winner proposal rejected. No ledger entries were created.");
}
