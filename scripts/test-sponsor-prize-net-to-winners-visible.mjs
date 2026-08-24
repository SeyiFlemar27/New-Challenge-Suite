import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
const approval = read("app/admin/prize-approvals/[proposalId]/page.tsx");
assert(reporting.includes("netSponsorPrizeCents") && reporting.includes("sponsorPrizeDistribution"));
assert(approval.includes("Net Sponsor Prize to Winners") && approval.includes("Net Credited"));
console.log("sponsor net winner prize visibility checks passed");
