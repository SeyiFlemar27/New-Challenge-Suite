import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const payout = readFileSync(join(process.cwd(), "lib/server/payout-structure.ts"), "utf8");
const builder = readFileSync(join(process.cwd(), "components/challenge-builder.tsx"), "utf8");

assert(payout.includes("calculateChallengeRevenueSplitPreview"), "challenge revenue split preview helper must exist.");
assert(payout.includes("platformFeePercent: PAID_REVENUE_SPLIT.platformAdminSharePercent"), "preview must reuse canonical platform fee percentage.");
assert(payout.includes("confirmedSponsorContributionCents") && payout.includes("sponsorContributionPlatformFeeCents: 0"), "sponsor contributions must be excluded from platform fee.");
assert(payout.includes("sponsorFundsExcludedFromPlatformFee: true"), "preview must explicitly mark sponsor fund exclusion.");
assert(payout.includes("noPayoutExecution: true") && payout.includes("noFakePrizePool: true"), "preview must remain foundation-only.");
assert(builder.includes("platform fee is 15% of confirmed paid entry, paid vote, and boost revenue only"), "builder preview must explain generated-revenue platform fee.");
assert(builder.includes("Sponsor contributions") && builder.includes("100% goes to approved winners"), "builder preview must explain sponsor funds go to winners after confirmation.");

console.log("Challenge revenue split preview checks passed.");
