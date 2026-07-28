import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const proposals=read("app/api/sponsor/proposals/route.ts"), dashboard=read("app/api/sponsor/dashboard/route.ts"), reporting=read("lib/server/sponsor-reporting.ts");
assert(proposals.includes('requireSponsorContext') && proposals.includes('sponsorProposals'));
assert(dashboard.includes('sponsorProposals') && reporting.includes('proposalsAwaitingReview'));
assert(proposals.includes('paymentReleaseStatus: "not_active"'));
console.log("Phase 7 sponsor proposal checks passed.");