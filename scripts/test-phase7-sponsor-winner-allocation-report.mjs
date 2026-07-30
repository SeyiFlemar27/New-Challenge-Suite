import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/sponsor-reporting.ts"), page=read("app/sponsor/dashboard/page.tsx"), payout=read("lib/server/payout-structure.ts");
assert(helper.includes('pending_winner_announcement') && helper.includes('pending_payout_verification'));
assert(page.includes('Winner allocation:') && page.includes('Settlement:'));
assert(payout.includes('sponsorFundsExcludedFromPlatformFee: true'));
console.log("Phase 7 sponsor winner allocation reporting checks passed.");
