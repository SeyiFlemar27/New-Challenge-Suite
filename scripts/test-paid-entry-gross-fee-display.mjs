import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const detail = read("app/challenges/[id]/page.tsx");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const checkout = read("app/api/challenges/[id]/entry-checkout/route.ts");

assert(detail.includes("entryFeeLabel") && detail.includes("Entry fee") && detail.includes("Pay & Enroll"), "challenge detail must display the gross entry fee and paid-entry CTA.");
assert(joinPage.includes("entryFeeLabel") && joinPage.includes("Pay Entry Fee"), "join page must display the gross entry fee in the payment CTA.");
assert(checkout.includes("paidEntryAmountCents(challenge)") && checkout.includes("checkoutLineItem"), "Stripe Checkout must use server-derived gross entry fee.");
assert(!detail.includes("net entry fee") && !joinPage.includes("net entry fee"), "participant UI must not show net/platform-deducted entry fee as the amount due.");
assert(!checkout.includes("amountCents: Number("), "client-submitted amounts must not control checkout amount.");

console.log("Paid-entry gross fee display checks passed.");
