import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
for (const file of ["lib/server/voting.ts", "lib/server/messages.ts", "lib/server/predictions.ts", "lib/server/prediction-settlement.ts", "lib/server/challenge-settlement.ts", "app/api/withdrawals/route.ts"]) {
  const source = read(file);
  assert.match(source, /writeAuditLog|auditLogs|AuditLogs|cashLedger|messageAuditLogs/, `${file} must write or pair with an immutable audit/ledger record`);
}
console.log("Critical operation audit checks passed.");
