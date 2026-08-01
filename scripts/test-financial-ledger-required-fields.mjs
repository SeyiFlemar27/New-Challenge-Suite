import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const funding = readFileSync("lib/server/prize-funding.ts", "utf8");
for (const field of ["transactionId", "userId", "purpose", "sourceResource", "grossAmountCents", "feeAmountCents", "netAmountCents", "currency", "direction", "status", "provider", "providerReference", "challengeId", "confirmedAt", "auditMetadata", "idempotencyKey"]) {
  assert(funding.includes(field), `creator prize ledger is missing ${field}`);
}
assert(funding.includes('db.collection("challengeFinancialLedger")'), "confirmed creator funding must create a financial ledger record");
assert(funding.includes("verifiedByWebhook: true"), "ledger audit metadata must record webhook verification");
console.log("financial ledger required-field checks passed");
