import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const discover=read("app/api/sponsor/discover/challenges/route.ts"), payments=read("lib/server/monetization-payments.ts");
assert(discover.includes('confirmedSponsorContributionWinnerShareCents'));
assert(payments.includes('brandingStatus: "pending_review"'));
console.log("Phase 7 sponsored challenge display checks passed.");