import assert from "node:assert/strict";
import { calculateNormalWinnerAmountsCents, normalWinnerPercentages } from "../lib/normal-challenge-prize-allocation.ts";

assert.deepEqual(normalWinnerPercentages(1), [100]);
assert.deepEqual(normalWinnerPercentages(3), [60, 25, 15]);
assert.deepEqual(normalWinnerPercentages(2), []);
assert.deepEqual(calculateNormalWinnerAmountsCents(10000, 1), [10000]);
assert.deepEqual(calculateNormalWinnerAmountsCents(10000, 3), [6000, 2500, 1500]);
assert.deepEqual(calculateNormalWinnerAmountsCents(101, 3), [60, 25, 16]);
assert.deepEqual(calculateNormalWinnerAmountsCents(1, 3), [0, 0, 1]);
assert.deepEqual(calculateNormalWinnerAmountsCents(10000, 2), []);
assert.deepEqual(calculateNormalWinnerAmountsCents(-1, 1), []);
assert.deepEqual(calculateNormalWinnerAmountsCents(1.5, 1), []);
for (const total of [0, 1, 99, 100, 101, 9999, 10000, 123456789]) {
  const amounts = calculateNormalWinnerAmountsCents(total, 3);
  assert.equal(amounts.reduce((sum, amount) => sum + amount, 0), total, `all cents remain allocated for total ${total}`);
}

console.log("PASS normal prize allocation runtime invariants (10 direct cases plus 8 conservation cases)");
