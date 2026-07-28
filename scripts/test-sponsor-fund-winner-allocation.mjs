import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const flow = read("lib/server/challenge-production-flow.ts");
const payments = read("lib/server/monetization-payments.ts");
const payout = read("lib/server/payout-structure.ts");
assert(flow.includes("sponsorFundsExcludedFromGeneratedRevenue: true") && flow.includes("sponsorContributionWinnerShareCents: sponsorFunds"), "sponsor funds must be excluded from generated revenue and directed to winners");
assert(payments.includes("sponsorContributionGoesFullyToWinners: true") && payments.includes("brandingStatus: \"pending_review\""), "confirmed sponsor contributions must be winner-directed and branding review-safe");
assert(payout.includes("sponsorContributionPlatformFeeCents: 0") && payout.includes("sponsorFundsExcludedFromPlatformFee: true"), "sponsor contributions must not take a platform fee");
console.log("sponsor fund winner allocation checks passed");