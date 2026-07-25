import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const success = readFileSync(join(root, "app/checkout/success/page.tsx"), "utf8");

assert(success.includes("Your plan is being verified"), "Checkout success should show simple verification state.");
assert(success.includes("Your plan is active"), "Checkout success should show simple active state.");
assert(success.includes("Payment received") && success.includes("Subscription verified") && success.includes("Setup / KYC"), "Checkout success should use a compact three-step plan verification stepper.");
assert(success.includes("Refresh Status"), "Pending state should offer refresh status CTA.");
assert(success.includes("Complete KYC") && success.includes("Start Setup"), "Confirmed Creator/Host state should expose setup/KYC CTAs.");
assert(success.includes("This page never activates subscriptions"), "Success page must preserve webhook-only activation copy.");
assert(!success.includes("Plan unlocked") && !success.includes("Start onboarding\"]"), "Success page should avoid heavy old checkout steps.");
assert(!/paid out|funds released|entry activated|vote credits granted|sponsor contribution confirmed/i.test(success), "Success page must not activate payment-dependent records.");

console.log("Premium checkout success flow checks passed.");
