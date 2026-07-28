import assert from "node:assert/strict"; import { exists, read } from "./production-flow-test-utils.mjs";
assert(exists("app/api/challenges/[id]/hybrid-stage/route.ts")); const route=read("app/api/challenges/[id]/hybrid-stage/route.ts"), helper=read("lib/server/advanced-competitions.ts");
assert(route.includes('evaluateHybridStageTransition') && route.includes('challengeAuditLogs'));
assert(helper.includes('HYBRID_STAGE_ORDER') && helper.includes('HYBRID_STAGE_ORDER_INVALID'));
console.log("Phase 8 hybrid stage transition checks passed.");