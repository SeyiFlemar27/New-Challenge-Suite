import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  buildPrizeApprovalPreview,
  canProposeChallengeWinners,
  getChallengeOrNull,
  normalizeWinnerProposalWinners,
  serializeProposal,
  validateWinnerProposalWinners
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

  const winners = normalizeWinnerProposalWinners(parsed.body?.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return validationError(validation.errors, "Winner proposal is invalid.");

  const now = new Date().toISOString();
  const ref = db.collection("winnerProposals").doc();
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
    createdAt: now,
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
    kycStillRequiredBeforeWithdrawal: true
  };

  await ref.set(payload);
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
