import { type DocumentData, type Firestore } from "firebase-admin/firestore";
import { getChallengeLifecycleState } from "@/lib/challenge-status";
import type { RequestUser } from "@/lib/server/auth";
import {
  CASH_EARNING_HOLD_HOURS,
  DEFAULT_CASH_CURRENCY,
  DEFAULT_WINNER_SPLITS,
  calculatePaidRevenueSplit,
  calculateWinnerDistribution,
  calculateWinnerPrizePool,
  holdUntilFromApproval
} from "@/lib/server/payout-structure";
import {
  buildConfirmedSettlementPreview,
  createInternalChallengeSettlement
} from "@/lib/server/challenge-settlement";

export const WINNER_PROPOSAL_STATUSES = [
  "draft",
  "proposed",
  "pending_admin_review",
  "approved",
  "rejected",
  "changes_requested"
] as const;

export type WinnerProposalStatus = typeof WINNER_PROPOSAL_STATUSES[number];

export type WinnerProposalWinnerInput = {
  userId?: unknown;
  submissionId?: unknown;
  placement?: unknown;
  splitPercent?: unknown;
  notes?: unknown;
};

export type NormalizedProposalWinner = {
  userId: string;
  submissionId: string | null;
  placement: number;
  splitPercent: number;
  proposedAmountPreviewCents: number;
  currency: string;
  notes: string | null;
};

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function status(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function defaultWinnerSplit(count: number) {
  if (count === 1) return DEFAULT_WINNER_SPLITS.single.map((item) => ({ position: item.position, percent: item.percent }));
  if (count === 2) return DEFAULT_WINNER_SPLITS.topTwo.map((item) => ({ position: item.position, percent: item.percent }));
  if (count === 3) return DEFAULT_WINNER_SPLITS.topThree.map((item) => ({ position: item.position, percent: item.percent }));
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => ({ position: index + 1, percent: index === count - 1 ? 100 - base * (count - 1) : base }));
}

export function normalizeWinnerProposalWinners(input: unknown): NormalizedProposalWinner[] {
  const raw = Array.isArray(input) ? input as WinnerProposalWinnerInput[] : [];
  const defaults = defaultWinnerSplit(raw.length);
  return raw.slice(0, 20).map((winner, index) => {
    const fallback = defaults[index] ?? { position: index + 1, percent: 0 };
    return {
      userId: text(winner.userId, 160),
      submissionId: text(winner.submissionId, 160) || null,
      placement: Math.max(1, Math.round(Number(winner.placement ?? fallback.position) || fallback.position)),
      splitPercent: Math.max(0, Math.round(Number(winner.splitPercent ?? fallback.percent) || 0)),
      proposedAmountPreviewCents: 0,
      currency: DEFAULT_CASH_CURRENCY,
      notes: text(winner.notes, 500) || null
    };
  });
}

export function validateWinnerProposalWinners(winners: NormalizedProposalWinner[]) {
  const errors: Record<string, string> = {};
  const totalPercent = winners.reduce((sum, winner) => sum + winner.splitPercent, 0);
  const placements = new Set<number>();
  const userIds = new Set<string>();

  if (!winners.length) errors.winners = "At least one proposed winner is required.";
  if (totalPercent !== 100) errors.winnerSplit = "Winner split must equal 100%.";

  winners.forEach((winner, index) => {
    if (!winner.userId) errors[`winners.${index}.userId`] = "Winner user ID is required.";
    if (winner.splitPercent < 0) errors[`winners.${index}.splitPercent`] = "Winner split cannot be negative.";
    if (winner.placement < 1) errors[`winners.${index}.placement`] = "Placement must be at least 1.";
    if (placements.has(winner.placement)) errors[`winners.${index}.placement`] = "Duplicate winner placements are not allowed.";
    if (winner.userId && userIds.has(winner.userId)) errors[`winners.${index}.userId`] = "Duplicate winner users are not allowed.";
    placements.add(winner.placement);
    if (winner.userId) userIds.add(winner.userId);
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    totalPercent,
    duplicatePlacementsBlocked: true,
    duplicateWinnersBlocked: true,
    negativeSplitsBlocked: true
  };
}

export function challengeOwnerIds(challenge: Record<string, unknown>) {
  return [
    challenge.creatorId,
    challenge.ownerId,
    challenge.hostId,
    challenge.operatorId,
    challenge.createdBy,
    challenge.userId
  ].map((value) => text(value, 160)).filter(Boolean);
}

export function canProposeChallengeWinners(user: RequestUser, challenge: Record<string, unknown>) {
  const owners = new Set(challengeOwnerIds(challenge));
  const role = status(user.role);
  const owned = owners.has(user.uid);
  const admin = Boolean(user.isAdmin);
  const eligibleOperator = owned && ["creator", "host", "enterprise", "admin", "user"].includes(role);
  const challengeStatus = status(challenge.status ?? challenge.lifecycleStatus);
  const blockedStatus = ["cancelled", "paused", "archived", "deleted"].includes(challengeStatus);
  const monetization = typeof challenge.monetization === "object" && challenge.monetization !== null ? challenge.monetization as Record<string, unknown> : {};
  const monetized = Boolean(
    monetization.paidEntryRequested
    || monetization.sponsorReady
    || monetization.prizePoolRequested
    || monetization.paidVotesRequested
    || challenge.prizePoolEnabled
    || challenge.prizeType === "money"
    || challenge.sponsorReady
    || challenge.sponsorEnabled
  );
  const freeMonetizedBlock = monetized && role === "user" && !admin;
  return {
    allowed: (admin || eligibleOperator) && !blockedStatus && !freeMonetizedBlock,
    owned,
    admin,
    role,
    blockedStatus,
    freeMonetizedBlock,
    reason: blockedStatus
      ? "Challenge is cancelled, paused, archived, or deleted."
      : freeMonetizedBlock
        ? "Free users cannot propose monetized prize winners."
        : admin || eligibleOperator
          ? "Winner proposal is allowed."
          : "Only the challenge owner, host, approved enterprise operator, or admin can propose winners."
  };
}

export function winnerProposalLifecycleReadiness(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  const challengeStatus = status(challenge.status ?? challenge.lifecycleStatus);
  const terminalBlocked = ["cancelled", "paused", "postponed", "archived", "deleted"].includes(challengeStatus);
  const alreadyApproved = Boolean(challenge.winnersApprovedAt || challenge.adminWinnersApprovedAt || challenge.adminWinnerApprovalStatus === "approved");
  const votingClosed = lifecycle.votingStatus === "voting_closed" || ["voting_closed", "under_review", "completed", "winners_announced"].includes(lifecycle.primaryStatus);
  const challengeEnded = lifecycle.participationStatus === "challenge_ended" || ["voting_closed", "under_review", "completed", "winners_announced"].includes(lifecycle.primaryStatus);
  const submissionsFinalized = lifecycle.submissionStatus === "submissions_closed" || lifecycle.submissionStatus === "no_submission_required";
  const ready = !terminalBlocked && !alreadyApproved && votingClosed && challengeEnded && submissionsFinalized;
  return {
    ready,
    lifecycle,
    terminalBlocked,
    alreadyApproved,
    votingClosed,
    challengeEnded,
    submissionsFinalized,
    message: ready ? "Winners can be proposed." : "Winners can be proposed after the challenge ends and voting closes."
  };
}

export function getConfirmedPrizeSources(challenge: Record<string, unknown>) {
  const entryFeeGrossCents = cents(challenge.confirmedEntryFeeGrossCents ?? challenge.confirmedPaidEntryGrossCents ?? challenge.confirmedEntryFeeRevenueCents);
  const paidVoteGrossCents = cents(challenge.confirmedPaidVoteGrossCents ?? challenge.confirmedPaidVoteRevenueCents);
  const entrySplit = calculatePaidRevenueSplit(entryFeeGrossCents, "entry_fee");
  const voteSplit = calculatePaidRevenueSplit(paidVoteGrossCents, "paid_vote");
  const entryFeeWinnerShareCents = cents(challenge.confirmedEntryFeeWinnerShareCents ?? challenge.entryFeeRevenueWinnerShareCents ?? entrySplit.winnerShareCents);
  const paidVoteWinnerShareCents = cents(challenge.confirmedPaidVoteWinnerShareCents ?? challenge.paidVoteRevenueWinnerShareCents ?? voteSplit.winnerShareCents);
  const sponsorContributionWinnerShareCents = cents(challenge.confirmedSponsorContributionWinnerShareCents ?? challenge.confirmedSponsorContributionCents);
  const approvedManualPrizeFundsCents = cents(challenge.approvedManualPrizeFundsCents);
  return {
    entryFeeGrossCents,
    paidVoteGrossCents,
    entryFeeWinnerShareCents,
    paidVoteWinnerShareCents,
    creatorHostOperatorShareCents: entrySplit.creatorHostOperatorShareCents + voteSplit.creatorHostOperatorShareCents,
    platformAdminShareCents: entrySplit.platformAdminShareCents + voteSplit.platformAdminShareCents,
    sponsorContributionWinnerShareCents,
    approvedManualPrizeFundsCents,
    usesConfirmedSourcesOnly: true,
    unconfirmedSponsorContributionIgnored: true
  };
}

export function buildPrizeApprovalPreview(input: {
  challengeId: string;
  proposalId: string;
  challenge: Record<string, unknown>;
  winners: NormalizedProposalWinner[];
  approvedAt?: string;
}) {
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const sources = getConfirmedPrizeSources(input.challenge);
  const prizePool = calculateWinnerPrizePool(sources);
  const distribution = calculateWinnerDistribution(
    prizePool.winnerPrizePoolCents,
    input.winners.map((winner) => ({ position: winner.placement, percent: winner.splitPercent }))
  );
  const holdUntil = holdUntilFromApproval(approvedAt, CASH_EARNING_HOLD_HOURS);
  const winnerAmounts = input.winners.map((winner) => {
    const match = distribution.distributions.find((item) => item.position === winner.placement);
    return {
      ...winner,
      proposedAmountPreviewCents: match?.allocatedCents ?? 0,
      status: prizePool.winnerPrizePoolCents > 0 ? "pending_hold_after_admin_approval" : "setup_required_no_confirmed_revenue",
      balanceBucket: "pending",
      holdUntil
    };
  });
  const ledgerFinalizationAvailable = distribution.valid
    && prizePool.winnerPrizePoolCents > 0
    && sources.usesConfirmedSourcesOnly;

  return {
    id: `preview_${input.challengeId}_${input.proposalId}`,
    challengeId: input.challengeId,
    proposalId: input.proposalId,
    currency: DEFAULT_CASH_CURRENCY,
    approvedAt,
    holdUntil,
    holdHours: CASH_EARNING_HOLD_HOURS,
    sources,
    prizePool,
    distribution,
    winnerAmounts,
    totalWinnerPrizePoolCents: prizePool.winnerPrizePoolCents,
    confirmedEntryFeeWinnerShareCents: sources.entryFeeWinnerShareCents,
    confirmedPaidVoteWinnerShareCents: sources.paidVoteWinnerShareCents,
    confirmedSponsorContributionWinnerShareCents: sources.sponsorContributionWinnerShareCents,
    creatorHostOperatorShareCents: sources.creatorHostOperatorShareCents,
    platformAdminShareCents: sources.platformAdminShareCents,
    sponsorContributionGoesFullyToWinners: true,
    sponsorContributionIgnoredIfUnconfirmed: true,
    platformShareNotFakedFromUnconfirmedRevenue: true,
    payoutPreviewUsesConfirmedSourcesOnly: true,
    ledgerFinalizationAvailable,
    ledgerFinalizationStatus: ledgerFinalizationAvailable ? "foundation_ready_pending_admin_approval" : "blocked_no_confirmed_payment_sources",
    kycRequiredBeforeWithdrawal: true,
    withdrawalBlockedUntilHoldKycAndProviderRequirements: true,
    providerPayoutCalled: false,
    marksPaidOrWithdrawn: false,
    createsCashLedgerEntries: false
  };
}

export function operatorRecipientId(challenge: Record<string, unknown>) {
  return text(challenge.operatorId, 160)
    || text(challenge.hostId, 160)
    || text(challenge.creatorId, 160)
    || text(challenge.ownerId, 160)
    || text(challenge.userId, 160);
}

export function buildLedgerFinalizationFoundation(input: {
  challengeId: string;
  proposalId: string;
  adminId: string;
  preview: ReturnType<typeof buildPrizeApprovalPreview>;
}) {
  const idempotencyPrefix = `${input.challengeId}_${input.proposalId}_admin_approval`;
  return {
    challengeId: input.challengeId,
    proposalId: input.proposalId,
    reviewedByAdminId: input.adminId,
    idempotencyPrefix,
    status: input.preview.ledgerFinalizationAvailable ? "prepared_pending_confirmed_ledger_worker" : "blocked_no_confirmed_payment_sources",
    entriesPreparedForReviewOnly: input.preview.winnerAmounts.map((winner) => ({
      idempotencyKey: `${idempotencyPrefix}_winner_${winner.userId}_${winner.placement}`,
      userId: winner.userId,
      challengeId: input.challengeId,
      sourceType: "challenge_prize",
      shareType: "winner_share",
      direction: "credit",
      amountCents: winner.proposedAmountPreviewCents,
      currency: input.preview.currency,
      balanceBucket: "pending",
      status: "pending_hold",
      holdUntil: input.preview.holdUntil,
      providerReference: null,
      paid: false,
      withdrawn: false
    })),
    createsSpendableBalance: false,
    createsProviderPayout: false,
    marksPaidAutomatically: false,
    kycStillRequiredBeforeWithdrawal: true
  };
}

export async function getWinnerCandidates(db: Firestore, challengeId: string) {
  const snap = await db.collection("submissions").where("challengeId", "==", challengeId).limit(250).get();
  const eligibleStatuses = new Set(["approved", "active", "winner", "submitted", "published"]);
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((submission) => eligibleStatuses.has(status(submission.status)) && !["flagged", "removed", "rejected", "disqualified"].includes(status(submission.moderationStatus)))
    .map((submission) => ({
      id: submission.id,
      submissionId: submission.id,
      userId: text(submission.userId ?? submission.participantUserId, 160),
      participantId: text(submission.participantId, 160) || null,
      displayName: text(submission.userName ?? submission.userDisplayName ?? submission.displayName, 120) || "Participant",
      title: text(submission.title, 160) || "Untitled submission",
      status: text(submission.status, 80) || "approved",
      voteCount: cents(submission.voteCount ?? submission.likes),
      weightedVoteCount: cents(submission.weightedVoteCount ?? submission.voteCount ?? submission.likes),
      submittedAt: typeof submission.submittedAt === "string" ? submission.submittedAt : typeof submission.createdAt === "string" ? submission.createdAt : null,
      eligible: Boolean(text(submission.userId ?? submission.participantUserId, 160)),
      source: "submissions"
    }))
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.weightedVoteCount - a.weightedVoteCount || b.voteCount - a.voteCount);
}

export async function getAdminPrizeApprovalDetail(db: Firestore, proposalId: string) {
  const proposal = await getProposalOrNull(db, proposalId);
  if (!proposal) return null;
  const challengeId = text(proposal.challengeId, 160);
  const challenge = challengeId ? await getChallengeOrNull(db, challengeId) : null;
  const winners = normalizeWinnerProposalWinners(proposal.winners);
  const validation = validateWinnerProposalWinners(winners);
  const preview = challenge ? await buildConfirmedSettlementPreview(db, { challengeId, challenge, winners }) : null;
  const settlementId = text(proposal.settlementId, 200) || `challenge_settlement_${challengeId}_${proposalId}`;
  const settlementSnap = challengeId ? await db.collection("challengeSettlements").doc(settlementId).get() : null;
  return {
    proposal,
    challenge,
    validation,
    preview,
    settlement: settlementSnap?.exists ? { id: settlementSnap.id, ...(settlementSnap.data() ?? {}) } : null,
    readiness: challenge ? winnerProposalLifecycleReadiness(challenge) : null,
    moneyMovementEnabled: false,
    payoutProviderCalled: false
  };
}

export async function finalizeApprovedWinnerProposalLedger(db: Firestore, input: {
  challengeId: string;
  proposalId: string;
  adminId: string;
}) {
  const [proposal, challenge] = await Promise.all([
    getProposalOrNull(db, input.proposalId),
    getChallengeOrNull(db, input.challengeId)
  ]);
  if (!proposal) return { finalized: false, status: "proposal_not_found", message: "Winner proposal not found.", ledgerEntriesCreated: 0, payoutProviderCalled: false };
  if (!challenge) return { finalized: false, status: "challenge_not_found", message: "Challenge not found.", ledgerEntriesCreated: 0, payoutProviderCalled: false };
  if (proposal.status !== "approved") return { finalized: false, status: "manual_review_required", message: "Admin approval is required before settlement.", ledgerEntriesCreated: 0, payoutProviderCalled: false };
  const winners = normalizeWinnerProposalWinners(proposal.winners);
  const validation = validateWinnerProposalWinners(winners);
  if (!validation.valid) return { finalized: false, status: "manual_review_required", message: "Winner split requires manual review.", validation, ledgerEntriesCreated: 0, payoutProviderCalled: false };
  const result = await createInternalChallengeSettlement(db, {
    challengeId: input.challengeId,
    proposalId: input.proposalId,
    adminId: input.adminId,
    challenge,
    winners,
    approvedAt: text(proposal.reviewedAt, 80) || undefined
  });
  return {
    ...result,
    finalized: true,
    status: String(result.settlement.status),
    message: result.idempotent
      ? "Internal settlement already exists. No duplicate credits were created."
      : "Internal settlement credits were created pending review. No payout provider was called.",
    ledgerEntriesCreated: result.walletCreditsCreated + result.platformLedgerEntriesCreated,
    payoutProviderCalled: false,
    marksPaidOrWithdrawn: false
  };
}

export function serializeProposal(doc: { id: string; data(): DocumentData }): Record<string, unknown> & { id: string } {
  return { id: doc.id, ...doc.data() };
}

export async function getChallengeOrNull(db: Firestore, challengeId: string): Promise<(Record<string, unknown> & { id: string }) | null> {
  const snap = await db.collection("challenges").doc(challengeId).get();
  return snap.exists ? { id: snap.id, ...(snap.data() ?? {}) } : null;
}

export async function getProposalOrNull(db: Firestore, proposalId: string): Promise<(Record<string, unknown> & { id: string }) | null> {
  const snap = await db.collection("winnerProposals").doc(proposalId).get();
  return snap.exists ? { id: snap.id, ...(snap.data() ?? {}) } : null;
}
