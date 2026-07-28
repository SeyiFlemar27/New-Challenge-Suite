import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const journey = read("lib/server/participant-journey.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const payments = read("lib/server/monetization-payments.ts");
assert(journey.includes('"payment_pending"') && journey.includes('"payment_required"'));
assert(webhook.includes("challenge_entry_fee") && payments.includes("webhookConfirmed: true") && payments.includes("entryPaymentStatus: \"paid\""));
console.log("Phase 3B paid public participant flow checks passed.");
