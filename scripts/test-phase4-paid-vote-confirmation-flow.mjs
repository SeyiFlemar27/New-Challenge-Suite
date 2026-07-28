import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const payments = read("lib/server/monetization-payments.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
assert(payments.includes("confirmedPaidVote") && webhook.includes("paid_vote"));
assert(webhook.includes("checkout.session.completed"));
console.log("phase4 provider-confirmed paid vote checks passed");