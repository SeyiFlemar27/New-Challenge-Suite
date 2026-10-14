import assert from "node:assert/strict";
import { runFinancialTransaction } from "../lib/server/financial-transaction.ts";

const closed = () => Object.assign(new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed."), { code: 3, details: "Transaction is invalid or closed." });
let calls = 0;
const identities = [];
const db = { runTransaction: async callback => {
  const transaction = { identity: ++calls };
  identities.push(transaction);
  const result = await callback(transaction);
  if (calls === 1) throw closed();
  return result;
} };
assert.equal(await runFinancialTransaction(db, async transaction => transaction.identity), 2);
assert.notEqual(identities[0], identities[1], "retry starts a fresh transaction");
assert.equal(calls, 2);
let exhausted = 0;
const terminal = closed();
await assert.rejects(() => runFinancialTransaction({ runTransaction: async () => { exhausted++; throw terminal; } }, async () => null), error => error === terminal);
assert.equal(exhausted, 3, "closed transactions cannot retry forever");
for (const error of [Object.assign(new Error("invalid field"), { code: 3 }), Object.assign(new Error("permission denied"), { code: 7 }), new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE")]) {
  let attempts = 0;
  await assert.rejects(() => runFinancialTransaction({ runTransaction: async () => { attempts++; throw error; } }, async () => null), value => value === error);
  assert.equal(attempts, 1, "policy, authorization and other argument errors propagate unchanged");
}
console.log("PASS financial transaction restart: 11 assertions; fresh identity, bounded exhaustion, unrelated errors preserved.");
