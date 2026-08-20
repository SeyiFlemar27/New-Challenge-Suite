import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  buildPrizeApprovalPreview,
  canProposeChallengeWinners,
  getChallengeOrNull,
  getWinnerCandidates,
  normalizeWinnerProposalWinners,
  serializeProposal,
  validateWinnerProposalWinners,
  winnerProposalLifecycleReadiness
} from "@/lib/server/prize-approvals";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner proposals");
  const { id: challengeId } = await params;
  const challenge = await getChallengeOrNull(db, challengeId);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const access = canProposeChallengeWinners(user, challenge);
  if (!access.allowed && !user.isAdmin) return fail(access.reason, 403, { reason: access.reason }, "WINNER_PROPOSAL_FORBIDDEN");

  const snap = await db.collection("winnerProposals").where("challengeId", "==", challengeId).limit(100).get();
  const proposals = snap.docs.map(serializeProposal).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return ok({ proposals, challengeId }, "Winner proposals loaded.");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner proposal creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { id: challengeId } = await params;
  const challenge = await getChallengeOrNull(db, challengeId);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");

  const access = canProposeChallengeWinners(user, challenge);
  if (!access.allowed) return fail(access.reason, 403, { reason: access.reason }, "WINNER_PROPOSAL_FORBIDDEN");
  const readiness = winnerProposalLifecycleReadiness(challenge);
  if (!readiness.ready) return fail(readiness.message, 409, { readiness }, "WINNER_PROPOSAL_NOT_READY");

  const winners = normalizeWinnerProposalWinners(parsed.body?.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return validationError(validation.errors, "Winner proposal is invalid.");
  const [candidates, existingProposalSnap] = await Promise.all([
    getWinnerCandidates(db, challengeId),
    db.collection("winnerProposals").where("challengeId", "==", challengeId).limit(25).get()
  ]);
  const proposals = existingProposalSnap.docs.sort((a, b) => String(b.data().updatedAt ?? b.data().createdAt ?? "").localeCompare(String(a.data().updatedAt ?? a.data().createdAt ?? "")));
  const approvedProposal = proposals.find((doc) => String(doc.data().status ?? "") === "approved");
  if (approvedProposal) return fail("Official winners are already approved for this challenge.", 409, { proposalId: approvedProposal.id }, "WINNERS_ALREADY_APPROVED");
  const editableProposal = proposals.find((doc) => ["draft", "pending_admin_review", "changes_requested", "rejected"].includes(String(doc.data().status ?? "")));
  const candidateByUserId = new Set(candidates.map((candidate) => candidate.userId));
  const candidateBySubmissionId = new Set(candidates.map((candidate) => candidate.submissionId));
  const invalidWinner = winners.find((winner) => !candidateByUserId.has(winner.userId) || (winner.submissionId && !candidateBySubmissionId.has(winner.submissionId)));
  if (invalidWinner) return fail("Selected winner must belong to an eligible challenge submission.", 400, { winner: invalidWinner }, "WINNER_CANDIDATE_INVALID");

  const now = new Date().toISOString();
  const ref = editableProposal?.ref ?? db.collection("winnerProposals").doc();
  const previous = editableProposal?.data() ?? {};
  const proposalStatus = parsed.body?.saveAsDraft === true ? "draft" : "pending_admin_review";
  const preview = buildPrizeApprovalPreview({ challengeId, proposalId: ref.id, challenge, winners, approvedAt: now });
  const payload = {
    id: ref.id,
    challengeId,
    challengeTitle: challenge.title ?? "",
    proposedByUserId: user.uid,
    proposedByRole: user.role ?? "user",
    status: proposalStatus,
    winners,
    winnerSplit: winners.map((winner) => ({ placement: winner.placement, splitPercent: winner.splitPercent })),
    notes: typeof parsed.body?.notes === "string" ? parsed.body.notes.trim().slice(0, 2000) : "",
    createdAt: previous.createdAt ?? now,
    updatedAt: now,
    submittedAt: proposalStatus === "pending_admin_review" ? now : null,
    reviewedAt: null,
    reviewedByAdminId: null,
    adminDecision: null,
    adminNote: null,
    payoutPreviewId: preview.id,
    ledgerPreview: preview,
    ledgerFinalizationStatus: "not_started",
    ledgerEntriesCreated: false,
    cashBalancesCredited: false,
    payoutProviderCalled: false,
    payoutMarkedPaid: false,
    kycStillRequiredBeforeWithdrawal: false,
    revision: Number(previous.revision ?? 0) + 1
  };

  const committed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists && String(current.data()?.status ?? "") === "approved") throw new Error("WINNERS_ALREADY_APPROVED");
    transaction.set(ref, payload, { merge: true });
    return true;
  }).catch((error) => {
    if (error instanceof Error && error.message === "WINNERS_ALREADY_APPROVED") return false;
    throw error;
  });
  if (!committed) return fail("Official winners were approved while this proposal was being updated.", 409, { proposalId: ref.id }, "WINNERS_ALREADY_APPROVED");
  await writeAuditLog({
    actorId: user.uid,
    actorType: user.isAdmin ? "admin" : user.role === "host" || user.role === "creator" ? "creator" : "user",
    action: "winner.selected",
    targetType: "winner",
    targetId: ref.id,
    reason: proposalStatus === "pending_admin_review" ? "Winner proposal submitted for admin review." : "Winner proposal saved as draft.",
    metadata: { challengeId, status: proposalStatus, ledgerEntriesCreated: false, payoutProviderCalled: false }
  }, db).catch((error) => console.warn("[winner-proposals:audit]", error instanceof Error ? error.message : String(error)));

  return ok({ proposal: payload }, proposalStatus === "pending_admin_review" ? "Winner proposal submitted for admin review. No ledger entries were created." : "Winner proposal draft saved. No ledger entries were created.");
}
