import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const settlement = read("lib/server/prediction-settlement.ts");
for (const status of ["open", "closing_soon", "locked", "awaiting_results", "under_review", "settled", "refunded", "disputed"]) assert(helper.includes(`"${status}"`));
assert(settlement.includes("auditLogs") && settlement.includes("deterministicId"));
assert(settlement.includes("settlementSnap.exists") && settlement.includes("idempotent: true"));
console.log("prediction settlement status and audit checks passed");
