import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  getConfirmedEntryRevenueForChallenge,
  getConfirmedPaidVoteRevenueForChallenge,
  getConfirmedSponsorContributionForChallenge
} from "@/lib/server/monetization-payments";
import {
  CASH_EARNING_HOLD_HOURS,
  DEFAULT_CASH_CURRENCY,
  PAID_REVENUE_SPLIT,
  calculatePaidRevenueSplit,
  holdUntilFromApproval
} from "@/lib/server/payout-structure";
import { createNotification } from "@/lib/server/notifications";
import { calculateGrowthWalletAllocation, calculatePaidEntrySplit, ECONOMY_V1_RULES, ECONOMY_V1_RULE_VERSION } from "@/lib/server/economy-rules";

export const SPONSOR_PRIZE_PLATFORM_FEE_PERCENT = 15;

export type SettlementWinner = {
  userId: string;
  submissionId: string | null;
  placement: number;
  splitPercent: number;
};

type ConfirmedSource = {
  grossAmountCents: number;
  recordCount: number;
  records: Array<Record<string, unknown> & { id: string }>;
};

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

function operatorRecipientId(challenge: Record<string, unknown>) {
  return text(challenge.operatorId)
    || text(challenge.hostId)
    || text(challenge.creatorId)
    || text(challenge.ownerId)
    || text(challenge.userId);
}

function creatorRecipientId(challenge: Record<string, unknown>) {
  return text(challenge.creatorId) || text(challenge.ownerId) || text(challenge.userId);
}

function hostSponsorRecipientId(challenge: Record<string, unknown>) {
  const creatorId = creatorRecipientId(challenge);
  return [challenge.liveHostId, challenge.hostId, challenge.sponsorId, challenge.operatorId].map((value) => text(value)).find((value) => value && value !== creatorId) ?? "";
}

export function defaultPlacementSplit(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [{ position: 1, percent: 100 }];
  if (count === 2) return [{ position: 1, percent: 70 }, { position: 2, percent: 30 }];
  if (count === 3) return [
    { position: 1, percent: 50 },
    { position: 2, percent: 30 },
    { position: 3, percent: 20 }
  ];
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    percent: index === count - 1 ? 100 - (base * (count - 1)) : base
  }));
}

function validPercentSplits(splits: Array<{ position: number; percent: number }>, winners: SettlementWinner[]) {
  const positions = new Set(winners.map((winner) => winner.placement));
  return splits.length === winners.length
    && splits.reduce((sum, split) => sum + split.percent, 0) === 100
    && splits.every((split) => positions.has(split.position) && split.percent >= 0);
}

function winnerSplits(winners: SettlementWinner[]) {
  const configured = winners.map((winner) => ({ position: winner.placement, percent: cents(winner.splitPercent) }));
  return validPercentSplits(configured, winners) ? configured : defaultPlacementSplit(winners.length);
}

function customSponsorSplits(challenge: Record<string, unknown>, winners: SettlementWinner[]) {
  const raw = challenge.sponsorPrizeDistribution
    ?? challenge.sponsorDistribution
    ?? challenge.sponsorPrizePlacementDistribution;
  if (!Array.isArray(raw)) return null;
  const splits = raw.map((item, index) => {
    const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    return {
      position: Math.max(1, Math.round(Number(record.position ?? record.placement ?? index + 1) || index + 1)),
      percent: cents(record.percent ?? record.percentage)
    };
  });
  return validPercentSplits(splits, winners) ? splits : null;
}

function distributeByPercent(amountCents: number, splits: Array<{ position: number; percent: number }>) {
  const amount = cents(amountCents);
  let allocated = 0;
  return splits.map((split, index) => {
    const allocation = index === splits.length - 1
      ? amount - allocated
      : Math.floor(amount * split.percent / 100);
    allocated += allocation;
    return { ...split, amountCents: allocation };
  });
}

function customSponsorAmountDistribution(challenge: Record<string, unknown>, winners: SettlementWinner[], grossAmountCents: number) {
  const raw = challenge.sponsorPrizeDistribution
    ?? challenge.sponsorDistribution
    ?? challenge.sponsorPrizePlacementDistribution;
  if (!Array.isArray(raw)) return null;
  const positions = new Set(winners.map((winner) => winner.placement));
  const amounts = raw.map((item, index) => {
    const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    return {
      position: Math.max(1, Math.round(Number(record.position ?? record.placement ?? index + 1) || index + 1)),
      amountCents: cents(record.amountCents ?? record.grossAmountCents ?? record.amount)
    };
  });
  const total = amounts.reduce((sum, item) => sum + item.amountCents, 0);
  return amounts.length === winners.length
    && total === cents(grossAmountCents)
    && amounts.every((item) => positions.has(item.position))
    ? amounts.map((item) => ({
      ...item,
      percent: grossAmountCents > 0 ? (item.amountCents / grossAmountCents) * 100 : 0
    }))
    : null;
}

function distributeByWeights(amountCents: number, weights: Array<{ position: number; amountCents: number; percent: number }>) {
  const amount = cents(amountCents);
  const totalWeight = weights.reduce((sum, item) => sum + item.amountCents, 0);
  let allocated = 0;
  return weights.map((item, index) => {
    const allocation = index === weights.length - 1
      ? amount - allocated
      : totalWeight > 0 ? Math.floor(amount * item.amountCents / totalWeight) : 0;
    allocated += allocation;
    return { position: item.position, percent: item.percent, amountCents: allocation };
  });
}

export function buildSettlementBreakdown(input: {
  challenge: Record<string, unknown>;
  winners: SettlementWinner[];
  confirmedEntryRevenueCents: number;
  confirmedPaidVoteRevenueCents: number;
  confirmedSponsorPrizeCents: number;
}) {
  const economyV1 = input.challenge.economyRuleVersion === ECONOMY_V1_RULE_VERSION;
  const grossConfirmedChallengeRevenue = economyV1 ? cents(input.confirmedEntryRevenueCents) : cents(input.confirmedEntryRevenueCents) + cents(input.confirmedPaidVoteRevenueCents);
  const legacySplit = calculatePaidRevenueSplit(grossConfirmedChallengeRevenue);
  const v1Split = calculatePaidEntrySplit(grossConfirmedChallengeRevenue);
  const generatedSplit = economyV1 ? { winnerShareCents: v1Split.winnerAmountCents, creatorHostOperatorShareCents: v1Split.creatorAmountCents, platformAdminShareCents: v1Split.platformAmountCents } : legacySplit;
  const grossConfirmedSponsorPrizeAmount = cents(input.confirmedSponsorPrizeCents);
  const sponsorPrizePlatformFeeAmount = Math.floor(grossConfirmedSponsorPrizeAmount * SPONSOR_PRIZE_PLATFORM_FEE_PERCENT / 100);
  const netSponsorPrizeAmount = grossConfirmedSponsorPrizeAmount - sponsorPrizePlatformFeeAmount;
  const challengeDistribution = distributeByPercent(generatedSplit.winnerShareCents, winnerSplits(input.winners));
  const sponsorSplits = customSponsorSplits(input.challenge, input.winners) ?? defaultPlacementSplit(input.winners.length);
  const sponsorGrossDistribution = customSponsorAmountDistribution(input.challenge, input.winners, grossConfirmedSponsorPrizeAmount)
    ?? distributeByPercent(grossConfirmedSponsorPrizeAmount, sponsorSplits);
  const sponsorFeeDistribution = distributeByWeights(sponsorPrizePlatformFeeAmount, sponsorGrossDistribution);
  const sponsorNetDistribution = sponsorGrossDistribution.map((gross) => {
    const fee = sponsorFeeDistribution.find((item) => item.position === gross.position);
    return { ...gross, amountCents: gross.amountCents - (fee?.amountCents ?? 0) };
  });

  return {
    currency: DEFAULT_CASH_CURRENCY,
    grossConfirmedChallengeRevenue,
    winnerPoolAmount: generatedSplit.winnerShareCents,
    creatorHostAmount: generatedSplit.creatorHostOperatorShareCents,
    platformChallengeFeeAmount: generatedSplit.platformAdminShareCents,
    hostSponsorAllocationAmount: economyV1 ? v1Split.hostSponsorAmountCents : 0,
    hostSponsorAllocationStatus: economyV1 ? hostSponsorRecipientId(input.challenge) ? "recipient_identified_pending_review" : "unresolved_admin_resolution_required" : "not_applicable_legacy_rule",
    paidVoteRevenueHeldAmount: economyV1 ? cents(input.confirmedPaidVoteRevenueCents) : 0,
    paidVoteRevenueReleaseStatus: economyV1 && input.confirmedPaidVoteRevenueCents > 0 ? "held_pending_completion_dispute_fraud_clearance" : "not_applicable",
    grossConfirmedSponsorPrizeAmount,
    sponsorPrizePlatformFeeRate: SPONSOR_PRIZE_PLATFORM_FEE_PERCENT / 100,
    sponsorPrizePlatformFeeAmount,
    netSponsorPrizeAmount,
    winnerDistribution: input.winners.map((winner) => {
      const allocation = challengeDistribution.find((item) => item.position === winner.placement);
      return {
        userId: winner.userId,
        submissionId: winner.submissionId,
        placement: winner.placement,
        splitPercent: allocation?.percent ?? 0,
        grossAmountCents: allocation?.amountCents ?? 0,
        feeRate: 0,
        feeAmountCents: 0,
        netAmountCents: allocation?.amountCents ?? 0
      };
    }),
    sponsorPrizeDistribution: input.winners.map((winner) => {
      const gross = sponsorGrossDistribution.find((item) => item.position === winner.placement);
      const fee = sponsorFeeDistribution.find((item) => item.position === winner.placement);
      const net = sponsorNetDistribution.find((item) => item.position === winner.placement);
      return {
        userId: winner.userId,
        submissionId: winner.submissionId,
        placement: winner.placement,
        splitPercent: gross?.percent ?? 0,
        grossAmountCents: gross?.amountCents ?? 0,
        feeRate: SPONSOR_PRIZE_PLATFORM_FEE_PERCENT / 100,
        feeAmountCents: fee?.amountCents ?? 0,
        netAmountCents: net?.amountCents ?? 0
      };
    }),
    challengeGeneratedRevenueSplit: economyV1 ? { winnerSharePercent: 65, platformAdminSharePercent: 15, creatorSharePercent: 10, hostSponsorSharePercent: 10 } : PAID_REVENUE_SPLIT,
    economyRuleVersion: economyV1 ? ECONOMY_V1_RULE_VERSION : String(input.challenge.economyRuleVersion ?? "legacy_paid_entry_v0"),
    sponsorMoneyExcludedFromChallengeSplit: true,
    creatorReceivesSponsorMoney: false,
    normalWinnerPrizeExtraFeeRate: 0,
    sponsorPrizeFeeDeductedOnce: true,
    externalPayoutExecuted: false
  };
}

export async function getConfirmedSettlementSources(db: Firestore, challengeId: string) {
  const [entry, paidVote, sponsor] = await Promise.all([
    getConfirmedEntryRevenueForChallenge(db, challengeId),
    getConfirmedPaidVoteRevenueForChallenge(db, challengeId),
    getConfirmedSponsorContributionForChallenge(db, challengeId)
  ]);
  const sourceIds = (source: ConfirmedSource) => source.records.map((record) => record.id);
  return {
    confirmedEntryRevenueCents: entry.grossAmountCents,
    confirmedPaidVoteRevenueCents: paidVote.grossAmountCents,
    confirmedSponsorPrizeCents: sponsor.grossAmountCents,
    entryPaymentCount: entry.recordCount,
    paidVotePaymentCount: paidVote.recordCount,
    sponsorPaymentCount: sponsor.recordCount,
    sourceBreakdown: {
      confirmedEntryPaymentIds: sourceIds(entry),
      confirmedPaidVotePaymentIds: sourceIds(paidVote),
      confirmedSponsorPaymentIds: sourceIds(sponsor)
    },
    confirmedOnly: true,
    pendingFailedCancelledExcluded: true
  };
}

export async function buildConfirmedSettlementPreview(db: Firestore, input: {
  challengeId: string;
  challenge: Record<string, unknown>;
  winners: SettlementWinner[];
}) {
  const sources = await getConfirmedSettlementSources(db, input.challengeId);
  return {
    ...buildSettlementBreakdown({
      challenge: input.challenge,
      winners: input.winners,
      ...sources
    }),
    ...sources,
    status: sources.confirmedEntryRevenueCents + sources.confirmedPaidVoteRevenueCents + sources.confirmedSponsorPrizeCents > 0
      ? "ready_for_admin_approval"
      : "awaiting_confirmed_revenue",
    createsInternalCreditsOnly: true,
    payoutProviderCalled: false,
    kycRequiredBeforeWithdrawal: true
  };
}

function cashLedgerEntry(input: {
  id: string;
  userId: string;
  challengeId: string;
  proposalId: string;
  settlementId: string;
  sourceType: "challenge_winner_prize" | "sponsor_prize" | "creator_challenge_earning" | "host_sponsor_entry_share";
  grossAmountCents: number;
  feeRate: number;
  feeAmountCents: number;
  netAmountCents: number;
  placement?: number;
  holdUntil: string | null;
  adminId: string;
  now: string;
}) {
  return {
    id: input.id,
    walletCreditId: input.id,
    userId: input.userId,
    challengeId: input.challengeId,
    proposalId: input.proposalId,
    settlementId: input.settlementId,
    sourceType: input.sourceType,
    sourceId: input.settlementId,
    type: "internal_settlement_credit",
    direction: "credit",
    grossAmountCents: input.grossAmountCents,
    feeRate: input.feeRate,
    feeAmountCents: input.feeAmountCents,
    netAmountCents: input.netAmountCents,
    amountCents: input.netAmountCents,
    currency: DEFAULT_CASH_CURRENCY,
    status: "pending_review",
    balanceBucket: "pending",
    pendingReviewAt: input.now,
    availableAt: null,
    holdUntil: input.holdUntil,
    placement: input.placement ?? null,
    idempotencyKey: input.id,
    kycRequiredBeforeWithdrawal: true,
    payoutProviderCalled: false,
    externalPayoutExecuted: false,
    paid: false,
    withdrawn: false,
    createdBy: "admin_winner_approval",
    reviewedBy: input.adminId,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export async function createInternalChallengeSettlement(db: Firestore, input: {
  challengeId: string;
  proposalId: string;
  adminId: string;
  challenge: Record<string, unknown>;
  winners: SettlementWinner[];
  approvedAt?: string;
}) {
  const sources = await getConfirmedSettlementSources(db, input.challengeId);
  const breakdown = buildSettlementBreakdown({
    challenge: input.challenge,
    winners: input.winners,
    ...sources
  });
  const settlementId = safeId(`challenge_settlement_${input.challengeId}_${input.proposalId}`);
  const settlementRef = db.collection("challengeSettlements").doc(settlementId);
  const proposalRef = db.collection("winnerProposals").doc(input.proposalId);
  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const now = input.approvedAt ?? new Date().toISOString();
  const holdUntil = holdUntilFromApproval(now, CASH_EARNING_HOLD_HOURS);
  const economyV1ForSettlement = breakdown.economyRuleVersion === ECONOMY_V1_RULE_VERSION;
  const creatorIdForSettlement = economyV1ForSettlement ? creatorRecipientId(input.challenge) : operatorRecipientId(input.challenge);
  const growthWalletRef = db.collection("creatorGrowthWallets").doc(creatorIdForSettlement || "unassigned_creator");

  const result = await db.runTransaction(async (transaction) => {
    const [settlementSnap, proposalSnap, challengeSnap, growthWalletSnap] = await Promise.all([
      transaction.get(settlementRef),
      transaction.get(proposalRef),
      transaction.get(challengeRef),
      transaction.get(growthWalletRef)
    ]);
    const confirmedMoneyNow = breakdown.grossConfirmedChallengeRevenue + breakdown.grossConfirmedSponsorPrizeAmount > 0;
    const existingSettlement = settlementSnap.exists ? settlementSnap.data() ?? {} : null;
    if (existingSettlement && (existingSettlement.status !== "awaiting_confirmed_revenue" || !confirmedMoneyNow)) {
      const storedSettlement = {
        id: settlementSnap.id,
        ...existingSettlement,
        status: String(existingSettlement.status ?? "created_pending_review")
      };
      return {
        settlement: storedSettlement,
        created: false,
        idempotent: true,
        walletCreditsCreated: 0,
        platformLedgerEntriesCreated: 0
      };
    }
    if (!proposalSnap.exists || proposalSnap.data()?.status !== "approved") {
      throw new Error("Admin-approved winners are required before settlement.");
    }
    if (!challengeSnap.exists) throw new Error("Challenge not found.");

    const walletCredits: Array<ReturnType<typeof cashLedgerEntry>> = [];
    for (const winner of breakdown.winnerDistribution) {
      if (winner.netAmountCents <= 0) continue;
      const id = safeId(`${settlementId}_challenge_winner_${winner.userId}_${winner.placement}`);
      walletCredits.push(cashLedgerEntry({
        id,
        userId: winner.userId,
        challengeId: input.challengeId,
        proposalId: input.proposalId,
        settlementId,
        sourceType: "challenge_winner_prize",
        grossAmountCents: winner.grossAmountCents,
        feeRate: 0,
        feeAmountCents: 0,
        netAmountCents: winner.netAmountCents,
        placement: winner.placement,
        holdUntil,
        adminId: input.adminId,
        now
      }));
    }
    for (const winner of breakdown.sponsorPrizeDistribution) {
      if (winner.netAmountCents <= 0) continue;
      const id = safeId(`${settlementId}_sponsor_prize_${winner.userId}_${winner.placement}`);
      walletCredits.push(cashLedgerEntry({
        id,
        userId: winner.userId,
        challengeId: input.challengeId,
        proposalId: input.proposalId,
        settlementId,
        sourceType: "sponsor_prize",
        grossAmountCents: winner.grossAmountCents,
        feeRate: SPONSOR_PRIZE_PLATFORM_FEE_PERCENT / 100,
        feeAmountCents: winner.feeAmountCents,
        netAmountCents: winner.netAmountCents,
        placement: winner.placement,
        holdUntil,
        adminId: input.adminId,
        now
      }));
    }
    const economyV1 = economyV1ForSettlement;
    const operatorId = creatorIdForSettlement;
    const configuredAllocation = Number(growthWalletSnap.data()?.allocationPercent);
    const allocationPercent = economyV1
      ? Number.isFinite(configuredAllocation) ? configuredAllocation : ECONOMY_V1_RULES.growthWallet.defaultAllocationPercent
      : 0;
    const growthAllocation = calculateGrowthWalletAllocation(breakdown.creatorHostAmount, allocationPercent);
    const creatorCashAmount = Math.max(0, breakdown.creatorHostAmount - growthAllocation.amountCents);
    if (operatorId && breakdown.creatorHostAmount > 0) {
      const id = safeId(`${settlementId}_creator_${operatorId}`);
      if (creatorCashAmount > 0) walletCredits.push(cashLedgerEntry({ id, userId: operatorId, challengeId: input.challengeId, proposalId: input.proposalId, settlementId, sourceType: "creator_challenge_earning", grossAmountCents: creatorCashAmount, feeRate: 0, feeAmountCents: 0, netAmountCents: creatorCashAmount, holdUntil, adminId: input.adminId, now }));
      if (economyV1 && growthAllocation.amountCents > 0) {
        const growthId = safeId(`${settlementId}_creator_growth_${operatorId}`);
        const expiresAtDate = new Date(now);
        expiresAtDate.setUTCMonth(expiresAtDate.getUTCMonth() + ECONOMY_V1_RULES.growthWallet.expiryMonths);
        transaction.create(db.collection("creatorGrowthWalletTransactions").doc(growthId), { id: growthId, userId: operatorId, challengeId: input.challengeId, settlementId, sourceType: "creator_earning_allocation", amountCents: growthAllocation.amountCents, signedAmountCents: growthAllocation.amountCents, direction: "credit", balanceBeforeCents: Number(growthWalletSnap.data()?.balanceCents ?? 0), balanceAfterCents: Number(growthWalletSnap.data()?.balanceCents ?? 0) + growthAllocation.amountCents, allocationPercent: growthAllocation.allocationPercent, reason: "Optional Creator Growth Wallet allocation from creator challenge earnings", ruleVersion: ECONOMY_V1_RULE_VERSION, status: "confirmed", withdrawable: false, restrictedUseOnly: true, expiresAt: expiresAtDate.toISOString(), createdBy: "admin_winner_approval", createdAt: now, immutable: true });
        transaction.set(growthWalletRef, { userId: operatorId, balanceCents: FieldValue.increment(growthAllocation.amountCents), allocationPercent: growthAllocation.allocationPercent, allocationOptIn: growthAllocation.allocationPercent > 0, withdrawable: false, restrictedUseOnly: true, ruleVersion: ECONOMY_V1_RULE_VERSION, updatedAt: now }, { merge: true });
      }
    }
    const hostSponsorId = economyV1 ? hostSponsorRecipientId(input.challenge) : "";
    if (hostSponsorId && breakdown.hostSponsorAllocationAmount > 0) {
      const id = safeId(`${settlementId}_host_sponsor_${hostSponsorId}`);
      walletCredits.push(cashLedgerEntry({ id, userId: hostSponsorId, challengeId: input.challengeId, proposalId: input.proposalId, settlementId, sourceType: "host_sponsor_entry_share", grossAmountCents: breakdown.hostSponsorAllocationAmount, feeRate: 0, feeAmountCents: 0, netAmountCents: breakdown.hostSponsorAllocationAmount, holdUntil, adminId: input.adminId, now }));
    } else if (economyV1 && breakdown.hostSponsorAllocationAmount > 0) {
      const unresolvedId = safeId(`${settlementId}_unresolved_host_sponsor`);
      transaction.create(db.collection("settlementUnresolvedAllocations").doc(unresolvedId), { id: unresolvedId, challengeId: input.challengeId, settlementId, amountCents: breakdown.hostSponsorAllocationAmount, currency: DEFAULT_CASH_CURRENCY, allocationType: "host_sponsor_share", status: "requires_admin_resolution", ruleVersion: ECONOMY_V1_RULE_VERSION, externalPayoutExecuted: false, createdAt: now, updatedAt: now });
      transaction.set(db.collection("adminActionTasks").doc(unresolvedId), { id: unresolvedId, type: "paid_entry_host_sponsor_allocation_unresolved", challengeId: input.challengeId, settlementId, amountCents: breakdown.hostSponsorAllocationAmount, status: "open", createdAt: now }, { merge: true });
    }

    for (const credit of walletCredits) {
      transaction.create(db.collection("cashLedger").doc(credit.id), credit);
      transaction.set(db.collection("cashWallets").doc(credit.userId), {
        userId: credit.userId,
        status: "review_only",
        currency: DEFAULT_CASH_CURRENCY,
        pendingBalanceCents: FieldValue.increment(credit.netAmountCents),
        lifetimeEarningsCents: FieldValue.increment(credit.netAmountCents),
        withdrawalsEnabled: false,
        payoutProviderConnected: false,
        updatedAt: now
      }, { merge: true });
    }

    const platformEntries: Array<Record<string, unknown>> = [];
    if (breakdown.platformChallengeFeeAmount > 0) {
      const id = safeId(`${settlementId}_platform_challenge_fee`);
      const entry = {
        id,
        challengeId: input.challengeId,
        proposalId: input.proposalId,
        settlementId,
        sourceType: "platform_challenge_fee",
        sourceId: settlementId,
        amountCents: breakdown.platformChallengeFeeAmount,
        currency: DEFAULT_CASH_CURRENCY,
        status: "recorded",
        direction: "credit",
        idempotencyKey: id,
        confirmedPaymentSourcesOnly: true,
        externalPayoutExecuted: false,
        createdAt: now,
        updatedAt: now
      };
      transaction.create(db.collection("platformLedger").doc(id), entry);
      platformEntries.push(entry);
    }
    if (breakdown.sponsorPrizePlatformFeeAmount > 0) {
      const id = safeId(`${settlementId}_sponsor_prize_platform_fee`);
      const entry = {
        id,
        challengeId: input.challengeId,
        proposalId: input.proposalId,
        settlementId,
        sourceType: "sponsor_prize_platform_fee",
        sourceId: settlementId,
        amountCents: breakdown.sponsorPrizePlatformFeeAmount,
        currency: DEFAULT_CASH_CURRENCY,
        status: "recorded",
        direction: "credit",
        idempotencyKey: id,
        confirmedPaymentSourcesOnly: true,
        feeRate: SPONSOR_PRIZE_PLATFORM_FEE_PERCENT / 100,
        externalPayoutExecuted: false,
        createdAt: now,
        updatedAt: now
      };
      transaction.create(db.collection("platformLedger").doc(id), entry);
      platformEntries.push(entry);
    }

    const hasConfirmedMoney = confirmedMoneyNow;
    const settlement = {
      id: settlementId,
      settlementId,
      challengeId: input.challengeId,
      proposalId: input.proposalId,
      status: hasConfirmedMoney ? "created_pending_review" : "awaiting_confirmed_revenue",
      ...breakdown,
      sourceBreakdown: sources.sourceBreakdown,
      approvedWinnerIds: input.winners.map((winner) => winner.userId),
      createdBy: input.adminId,
      reviewedByAdminId: input.adminId,
      createdAt: now,
      updatedAt: now,
      settledAt: now,
      holdUntil,
      auditLogId: safeId(`${settlementId}_audit`),
      walletCreditIds: walletCredits.map((credit) => credit.id),
      creatorGrowthAllocationAmountCents: growthAllocation.amountCents,
      creatorGrowthAllocationPercent: growthAllocation.allocationPercent,
      platformLedgerIds: platformEntries.map((entry) => String(entry.id)),
      payoutProviderCalled: false,
      externalPayoutExecuted: false,
      automaticBankTransferExecuted: false,
      automaticRefundExecuted: false,
      kycRequiredBeforeWithdrawal: true,
      confirmedPaymentSourcesOnly: true
    };
    transaction.set(settlementRef, settlement);
    transaction.set(proposalRef, {
      settlementId,
      settlementStatus: settlement.status,
      ledgerFinalizationStatus: settlement.status,
      ledgerFinalizedAt: now,
      ledgerFinalizedByAdminId: input.adminId,
      ledgerEntriesCreated: walletCredits.length > 0 || platformEntries.length > 0,
      ledgerEntryCount: walletCredits.length + platformEntries.length,
      cashBalancesCredited: walletCredits.length > 0,
      payoutProviderCalled: false,
      payoutMarkedPaid: false,
      holdUntil,
      updatedAt: now
    }, { merge: true });
    transaction.set(challengeRef, {
      winnersApprovedAt: now,
      adminWinnersApprovedAt: now,
      adminWinnerApprovalStatus: "approved",
      approvedWinnerIds: input.winners.map((winner) => winner.userId),
      settlementId,
      settlementStatus: settlement.status,
      resultsConfirmed: true,
      settlementPrepared: true,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(String(settlement.auditLogId)), {
      id: settlement.auditLogId,
      actorId: input.adminId,
      actorType: "admin",
      action: "challenge.settlement_created",
      targetType: "challenge",
      targetId: input.challengeId,
      reason: "Admin-approved winners created internal settlement credits. No external payout was executed.",
      metadata: {
        proposalId: input.proposalId,
        settlementId,
        grossConfirmedChallengeRevenue: breakdown.grossConfirmedChallengeRevenue,
        grossConfirmedSponsorPrizeAmount: breakdown.grossConfirmedSponsorPrizeAmount,
        walletCreditCount: walletCredits.length,
        platformLedgerCount: platformEntries.length,
        externalPayoutExecuted: false
      },
      createdAt: now
    });
    return {
      settlement,
      created: true,
      idempotent: false,
      walletCreditsCreated: walletCredits.length,
      platformLedgerEntriesCreated: platformEntries.length
    };
  });

  if (result.created && breakdown.grossConfirmedChallengeRevenue + breakdown.grossConfirmedSponsorPrizeAmount > 0) {
    const winnerIds = [...new Set(input.winners.map((winner) => winner.userId).filter(Boolean))];
    await Promise.allSettled([
      ...winnerIds.map((userId) => createNotification(db, {
        userId,
        type: "challenge_settlement_created",
        title: "Prize allocation prepared",
        body: "Your approved challenge prize allocation is in your cash wallet pending review.",
        targetId: input.challengeId,
        actionUrl: "/wallet",
        idempotencyKey: `${settlementId}_winner_notification_${userId}`
      })),
      operatorRecipientId(input.challenge) && breakdown.creatorHostAmount > 0 ? createNotification(db, {
        userId: operatorRecipientId(input.challenge),
        type: "creator_challenge_earning_created",
        title: "Challenge earning prepared",
        body: "Your confirmed challenge revenue share is in your cash wallet pending review.",
        targetId: input.challengeId,
        actionUrl: "/wallet",
        idempotencyKey: `${settlementId}_creator_notification`
      }) : Promise.resolve(null)
    ]);
  }

  return {
    ...result,
    breakdown,
    confirmedSources: sources,
    payoutProviderCalled: false,
    externalPayoutExecuted: false
  };
}
