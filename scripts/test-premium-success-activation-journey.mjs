import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/checkout/subscription/success/page.tsx", "utf8");
const status = readFileSync("app/api/payments/status/route.ts", "utf8");
const checkout = readFileSync("app/api/stripe/checkout/route.ts", "utf8");

assert(page.includes("Membership activation"), "subscription journey must be purpose-specific");
assert(page.includes("Finish Later"), "premium activation must allow setup to be deferred");
assert(page.includes("Continue Identity Verification"), "creator and host plans must expose the KYC continuation");
assert(checkout.includes('paymentPurpose: "subscription_payment"'), "subscription checkout must carry a server-controlled purpose");
assert(checkout.includes("/checkout/subscription/success"), "subscription checkout must return to its dedicated route");
assert(status.includes("entitlementActive"), "success state must query verified backend entitlement");
assert(!page.includes("never activates"), "production success UI must not show internal safeguard disclaimers");
console.log("premium activation journey checks passed");
