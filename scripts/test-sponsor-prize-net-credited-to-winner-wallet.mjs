import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes('sourceType: "sponsor_prize"'), "sponsor prize must use its own wallet source type");
assert(source.includes("netAmountCents: winner.netAmountCents"), "wallet credit must use net sponsor prize");
assert(source.includes("pendingBalanceCents: FieldValue.increment(credit.netAmountCents)"), "wallet pending balance must increment by net credit only");
console.log("sponsor prize net wallet credit checks passed");
