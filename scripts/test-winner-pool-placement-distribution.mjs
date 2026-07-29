import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("count === 1") && source.includes("position: 1, percent: 100"), "one winner must receive 100%");
assert(source.includes("count === 2") && source.includes("position: 1, percent: 70") && source.includes("position: 2, percent: 30"), "two winners must split 70/30");
assert(source.includes("position: 1, percent: 50") && source.includes("position: 3, percent: 20"), "three winners must split 50/30/20");
assert(source.includes("amount - allocated"), "last placement must receive deterministic rounding remainder");
console.log("winner placement distribution checks passed");
