import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const api = read("app/api/predictions/route.ts");
assert(helper.includes("preparePredictionStakeIncrease"));
assert(helper.includes("PREDICTION_TARGET_LOCKED") && helper.includes("pendingIncreaseAmountCents"));
assert(api.includes("You can increase your prediction only for the same participant."));
assert(api.includes('predictionIncrease: pending.increasing ? "true" : "false"'));
console.log("same-participant prediction increase checks passed");
