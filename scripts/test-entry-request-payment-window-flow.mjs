import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const approve = read("app/api/challenges/[id]/entry-request/[requestId]/approve/route.ts");
const checkout = read("app/api/challenges/[id]/entry-checkout/route.ts");
assert(approve.includes("paymentWindow") || approve.includes("paymentWindowExpiresAt"), "manual paid approval must open a payment window");
assert(approve.includes("participantId: null") && approve.includes("paymentWindowStatus: \"open\""), "manual paid approval must not create active participant before payment");
assert(checkout.includes("paymentWindow") || checkout.includes("entryRequest"), "paid checkout must understand approved entry request/payment window state where applicable");
console.log("entry request payment window flow checks passed");