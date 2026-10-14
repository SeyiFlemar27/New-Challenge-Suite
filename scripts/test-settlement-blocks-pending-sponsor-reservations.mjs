import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createInternalChallengeSettlement } from "../lib/server/challenge-settlement.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-challenge-suite" }, `pending-sponsor-settlement-${Date.now()}`);
const db = getFirestore(app);
const id = `pending_sponsor_settlement_${randomUUID().replaceAll("-", "")}`;
const challengeRef = db.collection("challenges").doc(id);
const proposalRef = db.collection("winnerProposals").doc(`${id}_proposal`);
const contributionRef = db.collection("sponsorContributions").doc(`${id}_contribution`);

try {
  const challenge = { id, creatorId: `${id}_creator`, builderVersion: "normal_v3", status: "winners_announced", numberOfWinners: 1, prizeValue: 5000 };
  await Promise.all([
    challengeRef.set(challenge),
    proposalRef.set({ id: proposalRef.id, challengeId: id, status: "approved" }),
    contributionRef.set({ id: contributionRef.id, challengeId: id, status: "pending", reservationStatus: "reserved", reservationExpiresAt: new Date(Date.now() + 60_000).toISOString(), amountCents: 10000 }),
  ]);
  await assert.rejects(
    () => createInternalChallengeSettlement(db, {
      challengeId: id,
      proposalId: proposalRef.id,
      adminId: `${id}_admin`,
      challenge,
      winners: [{ userId: `${id}_winner`, submissionId: `${id}_submission`, placement: 1, splitPercent: 100 }],
      confirmedSources: {
        confirmedEntryRevenueCents: 0,
        confirmedPaidVoteRevenueCents: 0,
        confirmedSponsorPrizeCents: 0,
        confirmedCreatorPrizeCents: 0,
        confirmedPromotionalPrizeCents: 0,
        entryPaymentCount: 0,
        paidVotePaymentCount: 0,
        sponsorPaymentCount: 0,
        creatorPrizePaymentCount: 0,
        promotionalPrizePaymentCount: 0,
        sourceBreakdown: { confirmedEntryPaymentIds: [], confirmedPaidVotePaymentIds: [], confirmedSponsorPaymentIds: [], confirmedCreatorPrizePaymentIds: [], confirmedPromotionalPrizeFundingIds: [] },
        confirmedOnly: true,
        pendingFailedCancelledExcluded: true,
      },
    }),
    /Sponsor funding reservations or payment reviews are unresolved/,
  );
  assert.equal((await db.collection("challengeSettlements").where("challengeId", "==", id).get()).size, 0, "unresolved funds cannot create a settlement record");
  assert.equal((await db.collection("cashWallets").where("userId", "==", challenge.creatorId).get()).size, 0, "unresolved funds cannot create creator wallet credit");
  await contributionRef.set({ status: "payment_review_required", reservationStatus: "ineligible_payment" }, { merge: true });
  await assert.rejects(
    () => createInternalChallengeSettlement(db, {
      challengeId: id,
      proposalId: proposalRef.id,
      adminId: `${id}_admin`,
      challenge,
      winners: [{ userId: `${id}_winner`, submissionId: `${id}_submission`, placement: 1, splitPercent: 100 }],
      confirmedSources: {
        confirmedEntryRevenueCents: 0,
        confirmedPaidVoteRevenueCents: 0,
        confirmedSponsorPrizeCents: 0,
        confirmedCreatorPrizeCents: 0,
        confirmedPromotionalPrizeCents: 0,
        entryPaymentCount: 0,
        paidVotePaymentCount: 0,
        sponsorPaymentCount: 0,
        creatorPrizePaymentCount: 0,
        promotionalPrizePaymentCount: 0,
        sourceBreakdown: { confirmedEntryPaymentIds: [], confirmedPaidVotePaymentIds: [], confirmedSponsorPaymentIds: [], confirmedCreatorPrizePaymentIds: [], confirmedPromotionalPrizeFundingIds: [] },
        confirmedOnly: true,
        pendingFailedCancelledExcluded: true,
      },
    }),
    /Sponsor funding reservations or payment reviews are unresolved/,
  );
  assert.equal((await db.collection("challengeSettlements").where("challengeId", "==", id).get()).size, 0, "unresolved successful-payment review cannot silently disappear before settlement");
  assert.equal((await db.collection("cashWallets").where("userId", "==", challenge.creatorId).get()).size, 0, "unresolved payment review creates no winner or creator wallet credit");
  await contributionRef.set({ status: "confirmed", reservationStatus: "confirmed_within_window", stripeDisputeRestricted: true }, { merge: true });
  await assert.rejects(
    () => createInternalChallengeSettlement(db, {
      challengeId: id,
      proposalId: proposalRef.id,
      adminId: `${id}_admin`,
      challenge,
      winners: [{ userId: `${id}_winner`, submissionId: `${id}_submission`, placement: 1, splitPercent: 100 }],
      confirmedSources: {
        confirmedEntryRevenueCents: 0,
        confirmedPaidVoteRevenueCents: 0,
        confirmedSponsorPrizeCents: 10000,
        confirmedCreatorPrizeCents: 0,
        confirmedPromotionalPrizeCents: 0,
        entryPaymentCount: 0,
        paidVotePaymentCount: 0,
        sponsorPaymentCount: 1,
        creatorPrizePaymentCount: 0,
        promotionalPrizePaymentCount: 0,
        sourceBreakdown: { confirmedEntryPaymentIds: [], confirmedPaidVotePaymentIds: [], confirmedSponsorPaymentIds: [contributionRef.id], confirmedCreatorPrizePaymentIds: [], confirmedPromotionalPrizeFundingIds: [] },
        confirmedOnly: true,
        pendingFailedCancelledExcluded: true,
      },
    }),
    /credited Sponsor contribution is disputed/,
  );
  assert.equal((await db.collection("challengeSettlements").where("challengeId", "==", id).get()).size, 0, "a post-credit dispute prevents a new settlement even after payment confirmation");
  assert.equal((await db.collection("cashWallets").where("userId", "==", challenge.creatorId).get()).size, 0, "disputed funding creates no settlement wallet credits");
  console.log("PASS settlement waits for Sponsor reservations, payment investigations, and post-credit dispute reconciliation; no settlement or wallet credit was written.");
} finally {
  await Promise.all([challengeRef.delete(), proposalRef.delete(), contributionRef.delete()]);
}
