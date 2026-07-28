import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/sponsor-reporting.ts"), analytics=read("app/api/sponsor/analytics/route.ts");
assert(helper.includes('confirmedSponsorFundsCents') && helper.includes('pendingSponsorFundsCents'));
assert(analytics.includes('buildSponsorReportingSummary') && analytics.includes('not_tracked_yet'));
console.log("Phase 7 real sponsor metrics checks passed.");