import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/challenge-settlement.ts");
assert(settlement.includes('sourceType: "challenge_winner_prize"'));
assert(settlement.includes("feeRate: 0") && settlement.includes("feeAmountCents: 0"));
console.log("challenge winner prize fee checks passed");
