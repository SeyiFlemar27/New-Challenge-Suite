import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const detail = read("app/challenges/[id]/page.tsx");
assert(helper.includes("visible: enabled && marketApproved && hasTargets"));
assert(detail.includes("predictionAccess?.visible") && detail.includes("Enter Prediction Arena"));
assert(detail.includes("Total staked") && detail.includes("Predictors") && detail.includes("Locked"));
console.log("eligible Prediction Arena visibility checks passed");
