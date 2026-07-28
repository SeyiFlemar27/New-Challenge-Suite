import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/sponsor/dashboard/page.tsx");
const reports = read("app/api/sponsor/reports/route.ts");
const analytics = read("app/api/sponsor/analytics/route.ts");
assert(dashboard.includes("Campaign performance") && reports.includes("sponsorReports"), "sponsor dashboard/reporting foundation must exist");
assert(analytics.includes("Not tracked yet") || dashboard.includes("No data yet"), "untracked metrics must be marked unavailable rather than faked");
assert(!reports.includes("fake impressions") && !reports.includes("fake conversions"), "sponsor reports must not add fake metrics");
console.log("sponsor campaign reporting foundation checks passed");