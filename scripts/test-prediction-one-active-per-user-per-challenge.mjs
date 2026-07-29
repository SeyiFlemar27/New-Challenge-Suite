import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/predictions.ts");
const api = read("app/api/predictions/route.ts");
assert(helper.includes('deterministicId("prediction", challengeId, predictorId)'));
assert(helper.includes('"pending_payment", "active", "settlement_pending", "won", "lost", "settled"'));
assert(api.includes("if (pending.existing)"));
assert(api.includes("Your prediction is active."));
assert(api.includes("Your existing prediction is shown."));
console.log("one active prediction per challenge checks passed");
