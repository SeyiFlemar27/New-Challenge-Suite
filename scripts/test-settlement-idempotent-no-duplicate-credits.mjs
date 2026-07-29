import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("challenge_settlement_${input.challengeId}_${input.proposalId}"), "settlement ID must be deterministic");
assert(source.includes("if (existingSettlement"), "existing settlement must be returned");
assert(source.includes("idempotent: true"), "idempotent response must be explicit");
assert(source.includes("transaction.create(db.collection(\"cashLedger\").doc(credit.id), credit)"), "wallet credits must use deterministic create semantics");
console.log("settlement idempotency checks passed");
