import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checkout = readFileSync("app/api/stripe/dorocoin-checkout/route.ts", "utf8");
const webhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
const page = readFileSync("app/checkout/dorocoins/success/page.tsx", "utf8");
const status = readFileSync("app/api/payments/status/route.ts", "utf8");

assert(checkout.includes('paymentPurpose: "dorocoin_purchase"'), "DoroCoin checkout must carry its purpose");
assert(checkout.includes("/checkout/dorocoins/success"), "DoroCoin checkout must return to its own success route");
assert(webhook.includes("applyDoroCoinTransaction"), "DoroCoin crediting must remain in verified webhook handling");
assert(!page.includes("applyDoroCoinTransaction"), "DoroCoin success UI must not credit coins");
assert(status.includes('deterministicId("stripe_session", reference, "dorocoin_purchase")'), "DoroCoin success must read the deterministic webhook transaction");
assert(page.includes("non-cash platform credits"), "DoroCoin journey must preserve non-cash language");
console.log("verified DoroCoin success checks passed");
