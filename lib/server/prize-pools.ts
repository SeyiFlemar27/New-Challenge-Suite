import type { Firestore } from "firebase-admin/firestore";

export type PrizePoolStatus = "disabled" | "pending_review" | "sponsor_funded_pending" | "locked" | "cancelled";
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
    status: amountCents > 0 ? "sponsor_funded_pending" : "pending_review",
    releaseStatus: "not_active",
    fundingStatus: amountCents > 0 ? "sponsor_intent_recorded" : "pending_review",
    paidEntryEnabled: false,
    cashPayoutsEnabled: false,
    transferEnabled: false,
    sponsorFundingReleaseEnabled: false,
    prizeReleaseEnabled: false,
    amountCents,
    totalCommittedCents: amountCents,
    totalReleasedCents: 0,
    currency: input.currency ?? "USD",
    sourceType: "sponsorship",
    sourceId: input.sponsorshipId,
    createdAt: now,
    updatedAt: now
  };
}

export async function writeDisabledPrizePoolFoundation(db: Firestore, challengeId: string, now = new Date().toISOString()) {
  const record = createDisabledPrizePoolFoundation(challengeId, now);
  await db.collection("prizePools").doc(challengeId).set(record, { merge: true });
  return record;
}

export async function mergeSponsorPrizePoolPlaceholder(db: Firestore, input: { challengeId: string; sponsorshipId: string; contributionCents: number; currency?: string; now?: string }) {
  const record = createSponsorPrizePoolPlaceholder(input);
  await db.collection("prizePools").doc(input.challengeId).set(record, { merge: true });
  return record;
}

export function isPrizePoolReleaseActive(pool: Pick<PrizePoolFoundation, "prizeReleaseEnabled"> | null | undefined) {
  return Boolean(pool?.prizeReleaseEnabled) && false;
}
