import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
for(const file of ["app/api/sponsor/dashboard/route.ts","app/api/sponsor/analytics/route.ts","app/api/sponsor/reports/route.ts"]){const text=read(file);assert(text.includes('requireSponsor') || text.includes('normalizeAccountType'));}
console.log("Phase 7 sponsor role guardrail checks passed.");