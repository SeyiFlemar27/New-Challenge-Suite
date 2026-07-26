import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const events = readFileSync(join(process.cwd(), "lib/server/financial/provider-events.ts"), "utf8");
const service = readFileSync(join(process.cwd(), "lib/server/financial/financial-service.ts"), "utf8");
assert(events.includes("providerEventFoundation") && events.includes("rawSecretStored: false"), "Provider event model must exist without storing secrets.");
assert(service.includes("ignored_duplicate"), "Duplicate provider event idempotency must be represented.");
assert(!service.includes("stripe.webhooks.constructEvent"), "Provider event foundation must not alter Stripe webhook verification.");
console.log("Financial provider event foundation checks passed.");
