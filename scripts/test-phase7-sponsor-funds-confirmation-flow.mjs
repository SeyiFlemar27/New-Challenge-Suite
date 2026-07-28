import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/sponsor-reporting.ts"), payments=read("lib/server/monetization-payments.ts");
assert(helper.includes('status === "confirmed" && record.webhookConfirmed === true'));
assert(payments.includes('paymentPurpose: "sponsor_funding"') && payments.includes('webhookConfirmed: true'));
console.log("Phase 7 sponsor funds confirmation checks passed.");