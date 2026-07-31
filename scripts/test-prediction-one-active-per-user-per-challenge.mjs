import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/predictions.ts");
const api = read("app/api/predictions/route.ts");
assert(helper.includes('deterministicId("prediction", challengeId, predictorId)'));
assert(helper.includes('"pending_payment", "active", "settlement_pending", "won", "lost", "settled"'));
assert(api.includes("if (pending.existing)"));
assert(helper.includes("PREDICTION_TARGET_LOCKED") && helper.includes("preparePredictionStakeIncrease"));
assert(api.includes("You can increase your prediction only for the same participant."));
console.log("one participant selection with same-target increase checks passed");
