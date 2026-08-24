import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
const finance = read("app/admin/finance/page.tsx");
assert(reporting.includes("sponsorPrizePlatformFeeCents"));
assert(finance.includes("Sponsor Prize Platform Fee"));
console.log("sponsor prize platform fee visibility checks passed");
