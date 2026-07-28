import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/predictions/route.ts");
assert(route.includes('requireRequestUser') && route.includes('eligibilityStatus') && route.includes('predictionSettlementReviews'));
assert(route.includes('payment_review_required') && route.includes('provider_checkout_not_created') && route.includes('moneyMovementEnabled: false'));
console.log("Phase 9 Prediction Arena stake review checks passed.");