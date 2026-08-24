import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes('sourceType: "sponsor_prize"'), "sponsor prize must use its own wallet source type");
assert(source.includes("netAmountCents: winner.netAmountCents"), "wallet credit must use net sponsor prize");
assert(source.includes('pendingBalanceCents: FieldValue.increment(credit.status === "pending_hold" ? 0 : credit.netAmountCents)'), "eligible wallet pending balance must increment by net credit only");
assert(source.includes('lockedBalanceCents: FieldValue.increment(credit.status === "pending_hold" ? credit.netAmountCents : 0)'), "held winner shares must remain locked instead of being redistributed");
console.log("sponsor prize net wallet credit checks passed");
