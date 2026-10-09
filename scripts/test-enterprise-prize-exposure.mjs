import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateEnterprisePrizeExposure, confirmedEnterpriseExposure, isEnterpriseFinanceResource, organizationOwnerForFinance, reserveEnterprisePrizeExposure, resolveEnterpriseFinancialOwnership } from "../lib/server/enterprise-prize-exposure.ts";

assert.equal(isEnterpriseFinanceResource({ officialChallenge: true }), true);
assert.equal(isEnterpriseFinanceResource({ ownershipType: "challenge_suite_official" }), true);
assert.equal(isEnterpriseFinanceResource({ enterpriseFinanceContextId: "org-1" }), true);
assert.equal(isEnterpriseFinanceResource({ creatorId: "user-1" }), false);
assert.equal(organizationOwnerForFinance({ organizationOwnerId: "org-1", creatorId: "user-1" }), "org-1");
assert.deepEqual(resolveEnterpriseFinancialOwnership({ officialChallenge: true, enterpriseOrganizationId: "org-1", creatorId: "user-1" }), { workspaceType: "enterprise", organizationOwnerId: "org-1", financialOwnerType: "organization" });
assert.deepEqual(resolveEnterpriseFinancialOwnership({ creatorId: "user-1" }), { workspaceType: "personal", organizationOwnerId: null, financialOwnerType: "user" });
assert.throws(() => resolveEnterpriseFinancialOwnership({ officialChallenge: true, creatorId: "user-1" }), /ENTERPRISE_ORGANIZATION_REQUIRED/);
assert.throws(() => organizationOwnerForFinance({ organizationOwnerId: "org-1", enterpriseOrganizationId: "org-2" }), /ENTERPRISE_FINANCE_OWNER_MISMATCH/);

const configuredAndCreatorFunded = calculateEnterprisePrizeExposure({
  challenge: { prizeValue: 5000, confirmedCreatorPrizeFundingCents: 500000 },
  limitData: { configuredPrizeCents: 500000, creatorConfirmedCents: 500000, confirmedCents: 500000, reservedCents: 0 },
});
assert.equal(configuredAndCreatorFunded.exposureCents, 500000, "creator funding that satisfies the configured $5,000 obligation is counted once");
assert.equal(calculateEnterprisePrizeExposure({
  challenge: { prizeValue: 10000, confirmedCreatorPrizeFundingCents: 1000000 },
  limitData: { configuredPrizeCents: 1000000, creatorConfirmedCents: 1000000, confirmedCents: 1000000, reservedCents: 0 },
}).exposureCents, 1000000, "configured and funded $10,000 obligation is not double-counted");

const pendingCreator = { configuredPrizeCents: 500000, creatorReservedCents: 500000, reservedCents: 500000 };
const pendingExposure = calculateEnterprisePrizeExposure({ challenge: { prizeValue: 5000 }, limitData: pendingCreator });
const confirmedTransition = confirmedEnterpriseExposure({ challenge: { prizeValue: 5000 }, limitData: pendingCreator, amountCents: 500000, sourceType: "creator" });
assert.equal(pendingExposure.exposureCents, 500000);
assert.equal(confirmedTransition.exposureCents, 500000, "pending creator reservation moves to confirmed without changing exposure");
assert.equal(confirmedTransition.creatorReservedCents, 0);
assert.equal(confirmedTransition.creatorConfirmedCents, 500000);
assert.equal(calculateEnterprisePrizeExposure({ challenge: { prizeValue: 5000 }, limitData: { configuredPrizeCents: 500000, creatorReservedCents: 0, reservedCents: 0 } }).exposureCents, 500000, "failed creator reservation release leaves only the configured obligation");

assert.equal(calculateEnterprisePrizeExposure({ challenge: { prizeValue: 5000, confirmedCreatorPrizeFundingCents: 500000, confirmedSponsorContributionCents: 100000 }, limitData: { configuredPrizeCents: 500000, creatorConfirmedCents: 500000, sponsorConfirmedCents: 100000, confirmedCents: 600000, reservedCents: 0 } }).exposureCents, 600000, "Sponsor funding is additive to the creator-funded obligation");
assert.equal(calculateEnterprisePrizeExposure({ challenge: { prizeValue: 0, confirmedEntryFeeAllocationCents: 650000 }, limitData: { entryConfirmedCents: 650000, confirmedCents: 650000, reservedCents: 0 } }).exposureCents, 650000, "only the allocated paid-entry winner share enters the prize pool");
assert.equal(calculateEnterprisePrizeExposure({ challenge: { prizeValue: 0, confirmedPlatformPromotionalCents: 100000 }, limitData: { promotionalConfirmedCents: 100000, confirmedCents: 100000, reservedCents: 0 } }).exposureCents, 100000, "admin promotion is additive pool funding");
assert.equal(calculateEnterprisePrizeExposure({ challenge: { prizeValue: 5000, confirmedCreatorPrizeFundingCents: 500000, confirmedSponsorContributionCents: 50000 }, limitData: { configuredPrizeCents: 500000, creatorConfirmedCents: 500000, sponsorConfirmedCents: 50000, confirmedCents: 550000, reservedCents: 0 } }).exposureCents, 550000, "refund reverses only the source-specific Sponsor contribution");
assert.throws(() => calculateEnterprisePrizeExposure({ challenge: { prizeValue: 10000, confirmedSponsorContributionCents: 1 }, limitData: { configuredPrizeCents: 1000000, sponsorConfirmedCents: 1, confirmedCents: 1, reservedCents: 0 } }), /ENTERPRISE_PRIZE_LIMIT_EXCEEDED/);

const draftRoute = await readFile(new URL("../app/api/challenges/drafts/[id]/route.ts", import.meta.url), "utf8");
const creatorConfirm = await readFile(new URL("../lib/server/prize-funding.ts", import.meta.url), "utf8");
const sponsorConfirm = await readFile(new URL("../lib/server/monetization-payments.ts", import.meta.url), "utf8");
const refunds = await readFile(new URL("../app/api/admin/refunds/route.ts", import.meta.url), "utf8");
const webhook = await readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const exposure = await readFile(new URL("../lib/server/enterprise-prize-exposure.ts", import.meta.url), "utf8");
assert.match(draftRoute, /prepareEnterprisePrizeValueUpdate\(db, transaction/);
assert.match(creatorConfirm, /reserveEnterprisePrizeExposureInTransaction\(/);
assert.match(sponsorConfirm, /reserveEnterprisePrizeExposureInTransaction\(/);
assert.match(creatorConfirm, /confirmEnterprisePrizeExposureInTransaction\(/);
assert.match(sponsorConfirm, /confirmEnterprisePrizeExposureInTransaction\(/);
assert.match(refunds, /creatorPrizeFundingPayments/);
assert.match(refunds, /finalizeEnterprisePrizeFundingRefund\(/);
assert.match(webhook, /"refund\.updated"/);
assert.match(webhook, /finalizeEnterprisePrizeFundingRefund\(/);
assert.match(exposure, /enterprise_prize_funding_refund/);
assert.match(exposure, /confirmedEntryFeeAllocationCents/);
console.log("PASS Enterprise exposure arithmetic, paid-entry allocation, aggregate confirmation cap, and shared transaction-path contracts");
