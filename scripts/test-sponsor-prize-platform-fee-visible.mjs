import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
const dashboard = read("app/sponsor/dashboard/page.tsx");
assert(reporting.includes("sponsorPrizePlatformFeeCents"));
assert(dashboard.includes("Platform fee (15%)"));
console.log("sponsor prize platform fee visibility checks passed");
