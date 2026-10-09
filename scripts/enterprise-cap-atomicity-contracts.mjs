import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const active = read("lib/server/enterprise-active-challenge-limit.ts");
const create = read("app/api/challenges/route.ts");
const publish = read("lib/server/challenge-review-submission.ts");
const prizeFunding = read("lib/server/prize-funding.ts");
const payments = read("lib/server/monetization-payments.ts");
const exposure = read("lib/server/enterprise-prize-exposure.ts");
const boost = read("app/api/challenges/[id]/boost/route.ts");
const storage = read("storage.rules");

assert.match(active, /runTransaction|transaction\.get\(quotaRef\)/);
assert.match(active, /enterpriseChallengeReservations/);
assert.match(active, /activeCount/);
assert.match(active, /legacyReservationDocs/);
assert.match(create, /prepareEnterpriseActiveChallengeSlot/);
assert.match(publish, /prepareEnterpriseActiveChallengeSlot/);
assert.match(prizeFunding, /enterprisePrizeFundingLimits/);
assert.match(prizeFunding, /pending_payment/);
assert.match(exposure, /MAXIMUM_EXPOSURE_CENTS/);
assert.match(exposure, /reserveEnterprisePrizeExposure/);
assert.match(exposure, /ENTERPRISE_PRIZE_LIMIT_EXCEEDED/);
assert.match(prizeFunding, /reserveEnterprisePrizeExposureInTransaction\(/);
assert.match(prizeFunding, /confirmedEnterpriseExposure\(/);
assert.match(prizeFunding, /releasePendingCreatorPrizeFunding/);
assert.match(payments, /reserveEnterprisePrizeExposureInTransaction\(/);
assert.match(read("scripts/test-enterprise-prize-cap-concurrency.mjs"), /Promise\.allSettled/);
assert.match(payments, /releasePendingSponsorContribution/);
assert.match(boost, /deterministicId\("monthly_boost_entitlement", "enterprise", enterpriseAccess!/);
assert.match(boost, /durationHours: 72/);
assert.match(storage, /staffAccess\.organizationId/);
assert.match(storage, /enterpriseAssignedUserIds/);
assert.match(storage, /expiresAtTimestamp/);

console.log("Enterprise active cap, funding cap, boost scope, and Storage authorization contracts passed (static contract coverage only).");
