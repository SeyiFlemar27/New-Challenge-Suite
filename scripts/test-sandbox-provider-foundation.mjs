import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sandbox = readFileSync(join(process.cwd(), "lib/server/financial/sandbox.ts"), "utf8");
assert(sandbox.includes("sandboxProviderFoundation") && sandbox.includes("productionEnabled: false"), "Sandbox provider foundation must exist and stay disabled in production.");
for (const action of ["confirm_test_prize_funding", "approve_test_kyc", "confirm_test_payout", "create_test_chargeback", "settle_test_prediction_market"]) assert(sandbox.includes(action), `${action} sandbox action must be represented.`);
console.log("Sandbox provider foundation checks passed.");
