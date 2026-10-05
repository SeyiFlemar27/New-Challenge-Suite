import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const verify = read("app/api/verify-checkout/route.ts");
const status = read("components/payment-status-journey.tsx");

assert.match(verify, /requireRequestUser/);
assert.match(verify, /metadata\.userId !== user\.uid/);
assert.match(verify, /This checkout is not available for the current account/);
assert.match(verify, /session\.payment_status/);
assert.match(verify, /webhookConfirmed/);
assert.doesNotMatch(verify, /creditDoroCoin|FieldValue\.increment|cashWallets/);
assert.match(status, /\/api\/verify-checkout/);
assert.match(status, /reference\?\.startsWith\("cs_"\)/);

console.log("verify-checkout remains authenticated, ownership-bound, and webhook-authoritative: ok");
