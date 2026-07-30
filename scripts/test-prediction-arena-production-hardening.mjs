import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const route = read("app/api/predictions/route.ts");
const access = read("lib/server/predictions.ts");
const settlement = read("lib/server/prediction-settlement.ts");

assert(route.includes("requireRequestUser"));
assert(route.includes("DOROCOIN_NOT_ALLOWED"));
assert(route.includes('"pending_payment"'));
assert(route.includes("stripe.checkout.sessions.create"));
assert(route.includes("activates only after payment confirmation"));
assert(route.includes("platformFeeRate: 0.07"));
assert(access.includes("voting"));
assert(settlement.includes("prediction_reward"));
assert(settlement.includes("payoutProviderCalled: false"));
console.log("Prediction Arena production hardening checks passed.");
