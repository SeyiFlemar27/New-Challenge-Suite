import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/predictions/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/predictions.ts");
const page = read("app/challenges/[id]/prediction/page.tsx");
assert(api.includes('status: "pending_payment"') || helper.includes('status: "pending_payment"'));
assert(api.includes("successPageActivatesPrediction: false"));
assert(helper.includes("session.payment_status !== \"paid\""));
assert(helper.includes('status: "active"'));
assert(webhook.includes("confirmPredictionPayment"));
assert(page.includes("pending payment confirmation"));
assert(!page.includes('status: "active"'));
console.log("prediction provider-confirmation checks passed");
