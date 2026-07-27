import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const success = read("app/checkout/success/page.tsx");
const entryCheckout = read("app/api/challenges/[id]/entry-checkout/route.ts");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const detailPage = read("app/challenges/[id]/page.tsx");

assert(entryCheckout.includes("?payment=processing") && !entryCheckout.includes("/join?payment=processing") && entryCheckout.includes("checkoutSuccessActivatesEntry: false"), "paid-entry checkout must return to challenge detail without activating entry.");
assert(detailPage.includes("paymentReturnState") && detailPage.includes("Confirming Payment"), "detail page must show contextual payment processing feedback.");
assert(success.includes("paidVoteReturn") && success.includes("sponsorFundingReturn"), "generic success page must distinguish payment contexts.");
assert(success.includes("This page never activates") && success.includes("does not grant votes") && success.includes("does not fund a challenge"), "success page must state webhook-only activation for each payment context.");
assert(!success.includes("Your plan is active"), "checkout success page must not use generic active-plan copy for every checkout.");

console.log("Contextual checkout feedback checks passed.");

