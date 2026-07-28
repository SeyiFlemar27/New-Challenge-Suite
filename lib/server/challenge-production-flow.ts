import { getChallengeLifecycleState } from "@/lib/challenge-status";
import { calculatePaidRevenueSplit } from "@/lib/server/payout-structure";

export type ChallengeFlowAction = "close_submissions" | "open_voting" | "close_voting" | "start_review" | "announce_winners" | "complete_challenge";
export type PreliminaryResultStatus = "pending_calculation" | "calculated" | "needs_review" | "blocked" | "failed";
export type AllocationStatus = "pending" | "available" | "held" | "reversed" | "paid_out" | "blocked_kyc" | "blocked_review";
export type RefundReviewStatus = "review_required" | "approved_for_manual_refund" | "rejected" | "reversed" | "cancelled";
export type FinanceReviewStatus = "pending_review" | "approved_for_manual_payout" | "held" | "released_to_available" | "rejected" | "flagged";

export const CHALLENGE_FLOW_AUDIT_EVENTS = {
  close_submissions: "SUBMISSIONS_CLOSED",
  open_voting: "VOTING_OPENED",
  close_voting: "VOTING_CLOSED",
  start_review: "WINNER_REVIEW_STARTED",
  preliminary_winners_calculated: "PRELIMINARY_WINNERS_CALCULATED",
  winner_proposal_submitted: "WINNER_PROPOSAL_SUBMITTED",
  winner_proposal_approved: "WINNER_PROPOSAL_APPROVED",
  winner_proposal_rejected: "WINNER_PROPOSAL_REJECTED",
  winners_validated: "WINNERS_VALIDATED",
  winners_announced: "WINNERS_ANNOUNCED",
  sponsor_funds_allocated: "SPONSOR_FUNDS_ALLOCATED",
  entry_revenue_allocated: "ENTRY_REVENUE_ALLOCATED",
  creator_revenue_pending: "CREATOR_REVENUE_PENDING",
  platform_revenue_pending: "PLATFORM_REVENUE_PENDING",
  settlement_review_required: "SETTLEMENT_REVIEW_REQUIRED"
} as const;

function status(challenge: Record<string, unknown>) {
  return String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
}

function terminal(challenge: Record<string, unknown>) {
  return ["cancelled", "completed", "winners_announced"].includes(status(challenge));
}

export function canCloseSubmission(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  const allowed = lifecycle.submissionStatus === "submissions_closed" && !terminal(challenge);
  return { allowed, reason: allowed ? null : lifecycle.submissionStatus === "submissions_open" ? "submission_window_still_open" : "submission_not_ready_to_close" };
}

export function canOpenVoting(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  const allowed = lifecycle.submissionStatus === "submissions_closed" && lifecycle.votingStatus === "voting_open" && !terminal(challenge);
  return { allowed, reason: allowed ? null : "voting_window_not_ready" };
}

export function canCloseVoting(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  const allowed = lifecycle.votingStatus === "voting_closed" && !terminal(challenge);
  return { allowed, reason: allowed ? null : "voting_not_closed" };
}

export function canStartWinnerReview(challenge: Record<string, unknown>, now = new Date()) {
  const close = canCloseVoting(challenge, now);
  const unresolved = Boolean(challenge.unresolvedReportsCount || challenge.fraudReviewRequired || challenge.disputeStatus === "open");
  return { allowed: close.allowed && !unresolved, reason: unresolved ? "review_hold_required" : close.reason };
}

export function canAnnounceWinners(challenge: Record<string, unknown>) {
  const approved = Boolean(challenge.winnersApprovedAt || challenge.adminWinnersApprovedAt || challenge.winnerProposalApprovedAt);
  const monetized = Boolean(challenge.sponsorReady || challenge.sponsorEnabled || challenge.entryFeeRequired || challenge.paidEntryEnabled || challenge.monetization);
  return { allowed: approved && !terminal(challenge), reason: approved ? null : monetized ? "admin_winner_validation_required" : "winner_review_required" };
}

export function canCompleteChallenge(challenge: Record<string, unknown>) {
  const announced = ["winners_announced", "completed"].includes(status(challenge)) || Boolean(challenge.winnersAnnouncedAt);
  return { allowed: announced, reason: announced ? null : "winners_not_announced" };
}

export function lifecycleUpdateForAction(action: ChallengeFlowAction, actorId: string, now = new Date().toISOString()) {
  const common = { updatedAt: now, updatedBy: actorId, lastLifecycleActionAt: now, lastLifecycleActionBy: actorId };
  if (action === "close_submissions") return { ...common, status: "submission_closed", lifecycleStatus: "submission_closed", submissionsClosedAt: now, auditEvent: CHALLENGE_FLOW_AUDIT_EVENTS.close_submissions };
  if (action === "open_voting") return { ...common, status: "voting_open", lifecycleStatus: "voting_open", votingOpenedAt: now, auditEvent: CHALLENGE_FLOW_AUDIT_EVENTS.open_voting };
  if (action === "close_voting") return { ...common, status: "voting_closed", lifecycleStatus: "voting_closed", votingClosedAt: now, auditEvent: CHALLENGE_FLOW_AUDIT_EVENTS.close_voting };
  if (action === "start_review") return { ...common, status: "under_review", lifecycleStatus: "under_review", winnerReviewStartedAt: now, adminValidationRequired: true, auditEvent: CHALLENGE_FLOW_AUDIT_EVENTS.start_review };
  if (action === "announce_winners") return { ...common, status: "winners_announced", lifecycleStatus: "winners_announced", winnersAnnouncedAt: now, payoutExecuted: false, auditEvent: CHALLENGE_FLOW_AUDIT_EVENTS.winners_announced };
  return { ...common, status: "completed", lifecycleStatus: "completed", completedAt: now, payoutExecuted: false, auditEvent: "CHALLENGE_COMPLETED" };
}

export function buildPreliminaryResultFoundation(input: { approvedSubmissionCount: number; winnerCount: number; votingClosed: boolean; hasReviewHold?: boolean }) {
  if (!input.votingClosed) return { status: "blocked" as PreliminaryResultStatus, reason: "voting_not_closed", eligibleWinnerCount: 0 };
  if (input.hasReviewHold) return { status: "needs_review" as PreliminaryResultStatus, reason: "review_hold_required", eligibleWinnerCount: 0 };
  if (input.approvedSubmissionCount < Math.max(1, input.winnerCount)) return { status: "blocked" as PreliminaryResultStatus, reason: "not_enough_approved_submissions", eligibleWinnerCount: input.approvedSubmissionCount };
  return { status: "calculated" as PreliminaryResultStatus, reason: null, eligibleWinnerCount: Math.min(input.approvedSubmissionCount, input.winnerCount) };
}

export function validateWinnerDistribution(distribution: Array<{ placement: number; percent: number }>, winnerCount: number) {
  const expected = Math.max(1, winnerCount);
  const rows = distribution.slice(0, expected);
  const total = rows.reduce((sum, row) => sum + Math.round(Number(row.percent ?? 0)), 0);
  return { valid: rows.length === expected && total === 100, totalPercent: total, requiredWinnerCount: expected };
}

function cents(value: unknown) {
  const amount = Math.round(Number(value ?? 0));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function buildSettlementPreview(input: { entryFeeRevenueCents?: number; paidVoteRevenueCents?: number; confirmedSponsorFundsCents?: number; manualPrizeFundsCents?: number }) {
  const entry = calculatePaidRevenueSplit(cents(input.entryFeeRevenueCents), "entry_fee");
  const votes = calculatePaidRevenueSplit(cents(input.paidVoteRevenueCents), "paid_vote");
  const sponsorFunds = cents(input.confirmedSponsorFundsCents);
  const manualPrizeFunds = cents(input.manualPrizeFundsCents);
  return {
    verifiedEntryRevenueCents: entry.grossAmountCents,
    verifiedPaidVoteRevenueCents: votes.grossAmountCents,
    confirmedSponsorFundsCents: sponsorFunds,
    sponsorFundsExcludedFromGeneratedRevenue: true,
    sponsorContributionWinnerShareCents: sponsorFunds,
    generatedRevenueCents: entry.grossAmountCents + votes.grossAmountCents,
    winnerAllocationCents: entry.winnerShareCents + votes.winnerShareCents + sponsorFunds + manualPrizeFunds,
    creatorHostPendingRevenueCents: entry.creatorHostOperatorShareCents + votes.creatorHostOperatorShareCents,
    platformPendingRevenueCents: entry.platformAdminShareCents + votes.platformAdminShareCents,
    allocationStatus: "pending" as AllocationStatus,
    payoutExecuted: false,
    refundExecuted: false,
    providerExecutionEnabled: false
  };
}

export function createRefundReviewFoundation(input: { challengeId: string; affectedUserId: string; sourcePaymentId: string; amountCents: number; currency?: string; reason: string; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  return {
    challengeId: input.challengeId,
    affectedUserId: input.affectedUserId,
    sourcePaymentId: input.sourcePaymentId,
    amountCents: cents(input.amountCents),
    currency: input.currency ?? "usd",
    reason: input.reason,
    status: "review_required" as RefundReviewStatus,
    providerRefundStatus: "not_started",
    refundProviderCalled: false,
    createdAt: now,
    updatedAt: now
  };
}