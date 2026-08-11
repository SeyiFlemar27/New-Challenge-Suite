import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/predictions/route.ts");
assert(route.includes("requireRequestUser") && route.includes("predictionAccessForViewer") && route.includes("findEligiblePredictionTarget"));
assert(route.includes("createPendingPrediction") && route.includes("stripe.checkout.sessions.create"));
assert(route.includes("webhookConfirmationRequired: true") && route.includes("successPageActivatesPrediction: false"));
assert(!route.includes('"KYC_REQUIRED"') && route.includes("AGE_VERIFICATION_REQUIRED"));
console.log("Phase 9 Prediction Arena stake review checks passed.");
