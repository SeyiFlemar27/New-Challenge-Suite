import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const wheel=read("app/rewards/wheel/page.tsx"), predictions=read("app/api/predictions/route.ts");
assert(!wheel.includes('fallback:') && !wheel.includes('1000 Cash') && !wheel.includes('iPhone 17') && !wheel.includes('visual_slot'));
assert(predictions.includes('externalPayoutsEnabled: false'));
assert(predictions.includes('webhookConfirmationRequired: true'));
assert(predictions.includes('successPageActivatesPrediction: false'));
console.log("Phase 9 no fake advanced monetization checks passed.");
