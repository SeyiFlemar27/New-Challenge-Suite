import type { Firestore } from "firebase-admin/firestore";

export type PrizePoolStatus =
  | "disabled"
  | "draft"
  | "pending_funding"
  | "pending_review"
  | "sponsor_funded_pending"
  | "funded"
  | "held"
  | "active"
  | "under_review"
  | "payout_review"
  | "completed"
  | "disputed"
  | "locked"
  | "cancelled";
export type PrizePoolReleaseStatus = "not_active";
export type PrizePoolFundingStatus = "not_active" | "pending_review" | "sponsor_intent_recorded";

export type PrizePoolFoundation = {
  challengeId: string;
  status: PrizePoolStatus;
  releaseStatus: PrizePoolReleaseStatus;
  fundingStatus: PrizePoolFundingStatus;
  paidEntryEnabled: false;
  cashPayoutsEnabled: false;
  transferEnabled: false;
  sponsorFundingReleaseEnabled: false;
  prizeReleaseEnabled: false;
  amountCents: number;
  totalCommittedCents: number;
  totalReleasedCents: number;
  grossEntryRevenueCents: number;
  visibleJackpotCents: number;
  platformFeeCents: number;
  platformFeePercent: 15;
  jackpotPercent: 85;
  paidEntryCount: number;
  payoutReviewStatus: "not_started" | "pending_review" | "under_review" | "completed" | "disputed";
  winnerSplits: Array<{ position: 1 | 2 | 3; percent: 60 | 25 | 15; expectedAmountCents: number }>;
  currency: string;
  sourceType: "challenge" | "sponsorship";
  sourceId: string;
  createdAt: string;
  updatedAt: string;
};

export function createDisabledPrizePoolFoundation(challengeId: string, now = new Date().toISOString(), currency = "USD"): PrizePoolFoundation {
  return {
    challengeId,
    status: "disabled",
    releaseStatus: "not_active",
    fundingStatus: "not_active",
    paidEntryEnabled: false,
    cashPayoutsEnabled: false,
    transferEnabled: false,
    sponsorFundingReleaseEnabled: false,
    prizeReleaseEnabled: false,
    amountCents: 0,
    totalCommittedCents: 0,
    totalReleasedCents: 0,
    grossEntryRevenueCents: 0,
    visibleJackpotCents: 0,
    platformFeeCents: 0,
    platformFeePercent: 15,
    jackpotPercent: 85,
    paidEntryCount: 0,
    payoutReviewStatus: "not_started",
    winnerSplits: winnerSplit(0),
    currency,
    sourceType: "challenge",
    sourceId: challengeId,
    createdAt: now,
    updatedAt: now
  };
}

export function createSponsorPrizePoolPlaceholder(input: { challengeId: string; sponsorshipId: string; contributionCents: number; currency?: string; now?: string }): PrizePoolFoundation {
  const now = input.now ?? new Date().toISOString();
  const amountCents = Math.max(0, Math.trunc(Number(input.contributionCents) || 0));
  return {
    challengeId: input.challengeId,
    status: amountCents > 0 ? "pending_review" : "pending_review",
    releaseStatus: "not_active",
    fundingStatus: "sponsor_intent_recorded",
    paidEntryEnabled: false,
    cashPayoutsEnabled: false,
    transferEnabled: false,
    sponsorFundingReleaseEnabled: false,
    prizeReleaseEnabled: false,
    amountCents: 0,
    totalCommittedCents: 0,
    totalReleasedCents: 0,
    grossEntryRevenueCents: 0,
    visibleJackpotCents: 0,
    platformFeeCents: 0,
    platformFeePercent: 15,
    jackpotPercent: 85,
    paidEntryCount: 0,
    payoutReviewStatus: "pending_review",
    winnerSplits: winnerSplit(0),
    currency: input.currency ?? "USD",
    sourceType: "sponsorship",
    sourceId: input.sponsorshipId,
    createdAt: now,
    updatedAt: now
  };
}

export function winnerSplit(jackpotCents: number): PrizePoolFoundation["winnerSplits"] {
  const amount = Math.max(0, Math.trunc(jackpotCents));
  return [
    { position: 1, percent: 60, expectedAmountCents: Math.floor(amount * 0.6) },
    { position: 2, percent: 25, expectedAmountCents: Math.floor(amount * 0.25) },
    { position: 3, percent: 15, expectedAmountCents: amount - Math.floor(amount * 0.6) - Math.floor(amount * 0.25) }
  ];
}

export function createChallengePrizePoolFoundation(input: {
  challengeId: string;
  prizeType?: string;
  prizeValueCents?: number;
  sponsorEnabled?: boolean;
  now?: string;
}): PrizePoolFoundation {
  const base = createDisabledPrizePoolFoundation(input.challengeId, input.now);
  const reviewRequired = !["none", "bragging_rights", ""].includes(String(input.prizeType ?? ""));
  const visibleJackpotCents = Math.max(0, Math.trunc(input.prizeValueCents ?? 0));
  return {
    ...base,
    status: reviewRequired ? input.sponsorEnabled ? "pending_funding" : "pending_review" : "disabled",
    fundingStatus: input.sponsorEnabled ? "pending_review" : "not_active",
    amountCents: visibleJackpotCents,
    visibleJackpotCents,
    totalCommittedCents: 0,
    payoutReviewStatus: reviewRequired ? "pending_review" : "not_started",
    winnerSplits: winnerSplit(visibleJackpotCents)
  };
}

export async function writeDisabledPrizePoolFoundation(db: Firestore, challengeId: string, now = new Date().toISOString()) {
  const record = createDisabledPrizePoolFoundation(challengeId, now);
  await db.collection("prizePools").doc(challengeId).set(record, { merge: true });
  return record;
}

export async function writeChallengePrizePoolFoundation(db: Firestore, input: Parameters<typeof createChallengePrizePoolFoundation>[0]) {
  const record = createChallengePrizePoolFoundation(input);
  await db.collection("prizePools").doc(input.challengeId).set(record, { merge: true });
  return record;
}

export function publicPrizePoolFields(pool: Partial<PrizePoolFoundation> | null | undefined) {
  const visibleJackpotCents = Number(pool?.visibleJackpotCents ?? pool?.amountCents ?? 0);
  return {
    status: pool?.status ?? "disabled",
    visibleJackpotCents,
    currency: pool?.currency ?? "USD",
    payoutReviewStatus: pool?.payoutReviewStatus ?? "not_started",
    winnerSplits: Array.isArray(pool?.winnerSplits) ? pool.winnerSplits : winnerSplit(visibleJackpotCents),
    transferEnabled: false,
    prizeReleaseEnabled: false
  };
}

export async function mergeSponsorPrizePoolPlaceholder(db: Firestore, input: { challengeId: string; sponsorshipId: string; contributionCents: number; currency?: string; now?: string }) {
  const record = createSponsorPrizePoolPlaceholder(input);
  await db.collection("prizePools").doc(input.challengeId).set(record, { merge: true });
  return record;
}

export function isPrizePoolReleaseActive(pool: Pick<PrizePoolFoundation, "prizeReleaseEnabled"> | null | undefined) {
  return Boolean(pool?.prizeReleaseEnabled) && false;
}
