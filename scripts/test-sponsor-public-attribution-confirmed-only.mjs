import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const discover = read("app/api/sponsor/discover/challenges/[challengeId]/route.ts");
const payments = read("lib/server/monetization-payments.ts");
assert(discover.includes("validateSponsorFundingWindow"), "sponsor opportunity details must validate funding window");
assert(payments.includes("confirmedSponsorContributionCents") && payments.includes("confirmedSponsorContributionWinnerShareCents"), "only confirmed sponsor contributions should feed public funding state");
console.log("sponsor public attribution confirmed-only checks passed");