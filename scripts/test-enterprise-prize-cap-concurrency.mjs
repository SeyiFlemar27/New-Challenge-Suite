import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { applyEnterprisePromotionalPrizeFundingInTransaction, reserveEnterprisePrizeExposureInTransaction } from "../lib/server/enterprise-prize-exposure.ts";
import { createPendingSponsorContribution } from "../lib/server/monetization-payments.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("BLOCKED: set FIRESTORE_EMULATOR_HOST to run the Enterprise funding-cap race test.");
  process.exitCode = 2;
} else {
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "challenge-suite-test" }, `enterprise-cap-${Date.now()}`);
  const db = getFirestore(app);
  const id = `cap_race_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const challengeRef = db.collection("challenges").doc(id);
  const limitRef = db.collection("enterprisePrizeFundingLimits").doc(id);
  const challenge = { officialChallenge: true, organizationOwnerId: `${id}_org`, prizeValue: 0, confirmedCreatorPrizeFundingCents: 900000, confirmedSponsorContributionCents: 0 };
  await challengeRef.set(challenge);
  await limitRef.set({ challengeId: id, organizationOwnerId: `${id}_org`, configuredPrizeCents: 0, confirmedCents: 900000, reservedCents: 0, exposureCents: 900000, maximumCents: 1000000 });
  const attempt = (source) => db.runTransaction((transaction) => reserveEnterprisePrizeExposureInTransaction(db, transaction, {
    challengeId: id,
    challenge,
    organizationOwnerId: `${id}_org`,
    amountCents: 100000,
    now: new Date().toISOString(),
  }).then((reservation) => ({ source, reservation })));
  try {
    const results = await Promise.allSettled([attempt("creator"), attempt("sponsor")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, "only one competing $1,000 reservation can fit under the $10,000 cap");
    assert.equal(results.filter((result) => result.status === "rejected" && String(result.reason).includes("ENTERPRISE_PRIZE_LIMIT_EXCEEDED")).length, 1);
    const stored = (await limitRef.get()).data();
    assert.equal(stored.confirmedCents + stored.reservedCents, 1000000);
  const duplicateId = `idempotency_${id}`;
  const duplicateChallengeId = `${id}_duplicate`;
  const duplicateOrgId = `${id}_duplicate_org`;
  const duplicateChallenge = { officialChallenge: true, organizationOwnerId: duplicateOrgId, status: "active", publishedAt: new Date().toISOString(), sponsorEnabled: true, prizeValue: 0, confirmedCreatorPrizeFundingCents: 900000, confirmedSponsorContributionCents: 0 };
  const duplicateChallengeRef = db.collection("challenges").doc(duplicateChallengeId);
  const duplicateLimitRef = db.collection("enterprisePrizeFundingLimits").doc(duplicateChallengeId);
  const duplicateContributionRef = db.collection("sponsorContributions").doc(`sponsor_funding_${duplicateChallengeId}_sponsor_1_${duplicateId}`);
  await duplicateChallengeRef.set(duplicateChallenge);
  await duplicateLimitRef.set({ challengeId: duplicateChallengeId, organizationOwnerId: duplicateOrgId, configuredPrizeCents: 0, confirmedCents: 900000, reservedCents: 0, exposureCents: 900000, maximumCents: 1000000 });
  const request = { sponsorId: "sponsor_1", challengeId: duplicateChallengeId, challenge: duplicateChallenge, sponsorProfile: {}, amountCents: 100000, idempotencyKey: duplicateId, now: new Date().toISOString() };
  const [first, duplicate] = await Promise.all([
    createPendingSponsorContribution(db, request),
    createPendingSponsorContribution(db, request),
  ]);
  assert.equal(first.id, duplicate.id, "duplicate Sponsor funding request resolves to one contribution record");
  const duplicateLimit = (await duplicateLimitRef.get()).data();
  assert.equal(duplicateLimit.confirmedCents + duplicateLimit.reservedCents, 1000000, "duplicate reservation increments shared exposure only once");
  await assert.rejects(() => createPendingSponsorContribution(db, { ...request, idempotencyKey: `${duplicateId}_over`, amountCents: 100001 }), /ENTERPRISE_PRIZE_LIMIT_EXCEEDED/);
  await Promise.all([duplicateChallengeRef.delete(), duplicateLimitRef.delete(), duplicateContributionRef.delete()]);
  const promoChallengeId = `${id}_promo`;
  const promoOrganizationId = `${id}_promo_org`;
  const promoChallenge = { officialChallenge: true, organizationOwnerId: promoOrganizationId, prizeValue: 0, confirmedCreatorPrizeFundingCents: 900000 };
  const promoChallengeRef = db.collection("challenges").doc(promoChallengeId);
  const promoLimitRef = db.collection("enterprisePrizeFundingLimits").doc(promoChallengeId);
  await promoChallengeRef.set(promoChallenge);
  await promoLimitRef.set({ challengeId: promoChallengeId, organizationOwnerId: promoOrganizationId, configuredPrizeCents: 0, confirmedCents: 900000, reservedCents: 0, exposureCents: 900000, maximumCents: 1000000 });
  const promoInput = { challengeId: promoChallengeId, fundingId: `${id}_promo_funding`, amountCents: 100000, adminId: "admin_fixture", idempotencyKey: `${id}_promo_key`, reason: "Approved Enterprise prize pool promotion", now: new Date().toISOString() };
  const [promo, duplicatePromo] = await Promise.all([
    db.runTransaction((transaction) => applyEnterprisePromotionalPrizeFundingInTransaction(db, transaction, promoInput)),
    db.runTransaction((transaction) => applyEnterprisePromotionalPrizeFundingInTransaction(db, transaction, promoInput)),
  ]);
  assert.equal([promo, duplicatePromo].filter((result) => result.idempotent === false).length, 1);
  assert.equal((await promoLimitRef.get()).data()?.confirmedCents, 1000000, "promotional funding shares the same capped exposure state");
  assert.equal((await db.collection("platformLedger").doc(promoInput.fundingId).get()).exists, true);
  await assert.rejects(() => db.runTransaction((transaction) => applyEnterprisePromotionalPrizeFundingInTransaction(db, transaction, { ...promoInput, fundingId: `${id}_promo_over`, idempotencyKey: `${id}_promo_over_key`, amountCents: 1 })), /ENTERPRISE_PRIZE_LIMIT_EXCEEDED/);
  await Promise.all([promoChallengeRef.delete(), promoLimitRef.delete(), db.collection("enterprisePromotionalPrizeFunding").doc(promoInput.fundingId).delete(), db.collection("platformLedger").doc(promoInput.fundingId).delete(), db.collection("prizePools").doc(promoChallengeId).delete()]);
  console.log("PASS Firestore Emulator creator/Sponsor/admin-promo cap sharing, exact $10,000 boundary, over-limit rejection, and duplicate reservation idempotency");
  } finally {
    await Promise.all([challengeRef.delete(), limitRef.delete()]);
    await app.delete();
  }
}
