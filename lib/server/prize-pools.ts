import type { Firestore } from "firebase-admin/firestore";
import { DEFAULT_WINNER_SPLITS } from "@/lib/server/payout-structure";

export type PrizePoolFundingSource = "creator_funded" | "entry_fee_allocated" | "sponsor_funded" | "platform_promotional";
export type PrizePoolStatus = "disabled" | "not_funded" | "funding_required" | "partially_funded" | "fully_funded" | "growing_pool" | "locked" | "distribution_pending" | "processing_payouts" | "distributed" | "refunded" | "reversed" | "pending_review" | "sponsor_funded_pending";

export type PrizePoolFoundation = {
  challengeId: string;
  status: PrizePoolStatus;
  fundingStatus: PrizePoolStatus;
  currency: string;
  amountCents: number;
  visibleJackpotCents: number;
  totalConfirmedCents: number;
  totalCommittedCents: number;
  totalReleasedCents: number;
  confirmedCreatorFundingCents: number;
  confirmedEntryFeeAllocationCents: number;
  confirmedSponsorContributionCents: number;
  confirmedPlatformPromotionalCents: number;
  fundingSources: PrizePoolFundingSource[];
  paidEntryEnabled: boolean;
  cashPayoutsEnabled: false;
  transferEnabled: false;
  prizeReleaseEnabled: false;
  payoutExecutionEnabled: false;
  disputeHoldHours: 24;
  payoutReviewStatus: "not_started" | "pending_review" | "under_review" | "completed" | "disputed";
  winnerSplits: Array<{ position: number; percent: number; expectedAmountCents: number }>;
  createdAt: string;
  updatedAt: string;
};

function cents(value: unknown) { return Math.max(0, Math.trunc(Number(value) || 0)); }

export function winnerSplit(poolCents: number, configured: Array<{ position: number; percent: number }> = DEFAULT_WINNER_SPLITS.topThree.map((item) => ({ ...item }))) {
  const pool = cents(poolCents);
  let allocated = 0;
  return configured.map((split, index) => {
    const expectedAmountCents = index === configured.length - 1 ? pool - allocated : Math.floor(pool * Number(split.percent) / 100);
    allocated += expectedAmountCents;
    return { position: Number(split.position), percent: Number(split.percent), expectedAmountCents };
  });
}

export function createDisabledPrizePoolFoundation(challengeId: string, now = new Date().toISOString(), currency = "USD"): PrizePoolFoundation {
  return {
    challengeId, status: "disabled", fundingStatus: "not_funded", currency, amountCents: 0, visibleJackpotCents: 0,
    totalConfirmedCents: 0, totalCommittedCents: 0, totalReleasedCents: 0, confirmedCreatorFundingCents: 0,
    confirmedEntryFeeAllocationCents: 0, confirmedSponsorContributionCents: 0, confirmedPlatformPromotionalCents: 0,
    fundingSources: [], paidEntryEnabled: false, cashPayoutsEnabled: false, transferEnabled: false, prizeReleaseEnabled: false,
    payoutExecutionEnabled: false, disputeHoldHours: 24, payoutReviewStatus: "not_started", winnerSplits: winnerSplit(0), createdAt: now, updatedAt: now
  };
}

export function createSponsorPrizePoolPlaceholder(input: { challengeId: string; sponsorshipId: string; contributionCents: number; currency?: string; now?: string }): PrizePoolFoundation & { sourceType: "sponsorship"; sourceId: string } {
  const now = input.now ?? new Date().toISOString();
  return { ...createDisabledPrizePoolFoundation(input.challengeId, now, input.currency ?? "USD"), status: "pending_review", fundingStatus: "pending_review", payoutReviewStatus: "pending_review", sourceType: "sponsorship", sourceId: input.sponsorshipId };
}

export function createChallengePrizePoolFoundation(input: { challengeId: string; prizeType?: string; prizeValueCents?: number; sponsorEnabled?: boolean; paidEntryEnabled?: boolean; now?: string }): PrizePoolFoundation {
  const base = createDisabledPrizePoolFoundation(input.challengeId, input.now);
  const requested = !["none", "bragging_rights", ""].includes(String(input.prizeType ?? "")) || cents(input.prizeValueCents) > 0 || input.sponsorEnabled || input.paidEntryEnabled;
  return {
    ...base,
    status: requested ? "funding_required" : "disabled",
    fundingStatus: requested ? "funding_required" : "not_funded",
    paidEntryEnabled: Boolean(input.paidEntryEnabled),
    payoutReviewStatus: requested ? "pending_review" : "not_started",
    fundingSources: [input.paidEntryEnabled ? "entry_fee_allocated" : null, input.sponsorEnabled ? "sponsor_funded" : null].filter((item): item is PrizePoolFundingSource => Boolean(item))
  };
}

export async function writeDisabledPrizePoolFoundation(db: Firestore, challengeId: string, now = new Date().toISOString()) {
  const record = createDisabledPrizePoolFoundation(challengeId, now);
  await db.collection("prizePools").doc(challengeId).set(record, { merge: true });
  return record;
}

export async function writeChallengePrizePoolFoundation(db: Firestore, input: Parameters<typeof createChallengePrizePoolFoundation>[0]) {
  const ref = db.collection("prizePools").doc(input.challengeId);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? existingSnap.data() ?? {} : {};
  const record = mergeChallengePrizePoolFoundation(existing, input);
  await ref.set(record, { merge: true });
  return record;
}

export function mergeChallengePrizePoolFoundation(existing: Record<string, unknown>, input: Parameters<typeof createChallengePrizePoolFoundation>[0]) {
  const base = createChallengePrizePoolFoundation(input);
  const creator = cents(existing.confirmedCreatorFundingCents);
  const entry = cents(existing.confirmedEntryFeeAllocationCents);
  const sponsor = cents(existing.confirmedSponsorContributionCents);
  const platform = cents(existing.confirmedPlatformPromotionalCents);
  const total = creator + entry + sponsor + platform;
  const sources = new Set<PrizePoolFundingSource>(base.fundingSources);
  if (creator) sources.add("creator_funded"); if (entry) sources.add("entry_fee_allocated"); if (sponsor) sources.add("sponsor_funded"); if (platform) sources.add("platform_promotional");
  return { ...base, ...existing, confirmedCreatorFundingCents: creator, confirmedEntryFeeAllocationCents: entry, confirmedSponsorContributionCents: sponsor, confirmedPlatformPromotionalCents: platform, totalConfirmedCents: total, totalCommittedCents: Math.max(total, cents(existing.totalCommittedCents)), amountCents: total, visibleJackpotCents: total, fundingSources: [...sources], status: total > 0 ? String(existing.status ?? "fully_funded") : base.status, fundingStatus: total > 0 ? String(existing.fundingStatus ?? "fully_funded") : base.fundingStatus, winnerSplits: winnerSplit(total), updatedAt: input.now ?? new Date().toISOString() };
}

export function publicPrizePoolFields(pool: Partial<PrizePoolFoundation> | null | undefined) {
  const visibleJackpotCents = cents(pool?.visibleJackpotCents ?? pool?.totalConfirmedCents ?? pool?.amountCents);
  return { status: pool?.status ?? "disabled", fundingStatus: pool?.fundingStatus ?? "not_funded", visibleJackpotCents, currency: pool?.currency ?? "USD", payoutReviewStatus: pool?.payoutReviewStatus ?? "not_started", winnerSplits: winnerSplit(visibleJackpotCents, Array.isArray(pool?.winnerSplits) && pool.winnerSplits.length ? pool.winnerSplits : undefined), fundingSources: pool?.fundingSources ?? [], transferEnabled: false, prizeReleaseEnabled: false, payoutExecutionEnabled: false };
}

export async function mergeSponsorPrizePoolPlaceholder(db: Firestore, input: { challengeId: string; sponsorshipId: string; contributionCents: number; currency?: string; now?: string }) {
  const record = createSponsorPrizePoolPlaceholder(input);
  await db.collection("prizePools").doc(input.challengeId).set(record, { merge: true });
  return record;
}

export function isPrizePoolReleaseActive() { return false; }
