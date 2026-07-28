import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/sponsor/dashboard/route.ts"), page=read("app/sponsor/dashboard/page.tsx");
assert(route.includes('sponsorCampaignBriefs') && route.includes('sponsorContributions') && route.includes('buildSponsorReportingSummary'));
assert(page.includes('/api/sponsor/dashboard') && page.includes('Sponsored challenges'));
assert(!route.includes('activeCampaigns: 0'));
console.log("Phase 7 real sponsor dashboard checks passed.");