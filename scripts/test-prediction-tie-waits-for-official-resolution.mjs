import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/prediction-settlement.ts");
assert(settlement.includes("official_result_required") && settlement.includes('status: "under_review"'));
assert(settlement.includes('proposalSnap.data()?.status !== "approved"'));
console.log("prediction tie official-resolution checks passed");
