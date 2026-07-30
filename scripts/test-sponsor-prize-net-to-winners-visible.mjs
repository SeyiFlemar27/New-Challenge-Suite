import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
const dashboard = read("app/sponsor/dashboard/page.tsx");
assert(reporting.includes("netSponsorPrizeCents") && reporting.includes("sponsorPrizeDistribution"));
assert(dashboard.includes("Net prize to winners"));
console.log("sponsor net winner prize visibility checks passed");
