import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { RequestUser } from "@/lib/server/auth";
import {
  CASH_EARNING_HOLD_HOURS,
  DEFAULT_CASH_CURRENCY,
  DEFAULT_WINNER_SPLITS,
  calculateWinnerDistribution,
  calculateWinnerPrizePool,
  holdUntilFromApproval
} from "@/lib/server/payout-structure";

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
  const monetized = Boolean(
    challenge.monetization
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

export function getConfirmedPrizeSources(challenge: Record<string, unknown>) {
  const entryFeeWinnerShareCents = cents(challenge.confirmedEntryFeeWinnerShareCents ?? challenge.entryFeeRevenueWinnerShareCents);
  const paidVoteWinnerShareCents = cents(challenge.confirmedPaidVoteWinnerShareCents ?? challenge.paidVoteRevenueWinnerShareCents);
  const sponsorContributionWinnerShareCents = cents(challenge.confirmedSponsorContributionWinnerShareCents ?? challenge.confirmedSponsorContributionCents);
  const approvedManualPrizeFundsCents = cents(challenge.approvedManualPrizeFundsCents);
  return {
    entryFeeWinnerShareCents,
    paidVoteWinnerShareCents,
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
