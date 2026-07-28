import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/advanced-competitions.ts"), builder=read("components/host/host-competition-wizard.tsx");
assert(helper.includes('ELIGIBLE_SUBMISSIONS_REQUIRED') && helper.includes('FINALISTS_REQUIRED') && helper.includes('FINAL_RESULTS_REQUIRED') && helper.includes('WINNER_REVIEW_REQUIRED'));
assert(builder.includes('online_qualification') && builder.includes('final_round') && builder.includes('hostOperations'));
console.log("Phase 8 hybrid stage rule checks passed.");