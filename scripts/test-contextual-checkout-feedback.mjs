import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const success = read("app/checkout/success/page.tsx");
const entryCheckout = read("app/api/challenges/[id]/entry-checkout/route.ts");
const registrationSuccess = read("app/challenges/[id]/registration-success/page.tsx");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const detailPage = read("app/challenges/[id]/page.tsx");

assert(entryCheckout.includes("/registration-success?entryPaymentId=") && entryCheckout.includes("session_id={CHECKOUT_SESSION_ID}") && entryCheckout.includes("checkoutSuccessActivatesEntry: false"), "paid-entry checkout must return to its verified registration state without activating entry.");
assert(registrationSuccess.includes("PaymentStatusJourney") && registrationSuccess.includes("Confirming your entry payment"), "registration return must show contextual verified payment feedback.");
assert(detailPage.includes("paymentReturnState"), "detail page must retain contextual payment feedback for direct cancellation or legacy returns.");
assert(success.includes("CheckoutReturnDispatcher") && success.includes("paid_vote") && success.includes("sponsor_funding"), "legacy checkout return must distinguish payment contexts before routing to their verified status pages.");
assert(success.includes("registration-success") && success.includes("paid-votes/success") && success.includes("/sponsor/funding/"), "legacy checkout return must preserve each payment context without activating it.");
assert(!success.includes("Your plan is active"), "checkout return must not use generic active-plan copy for every checkout.");

console.log("Contextual checkout feedback checks passed.");

