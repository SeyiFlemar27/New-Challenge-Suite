import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
assert(voting.includes("db.runTransaction"));
assert(voting.includes("balance: balance - coinCost"));
assert(voting.includes("transaction.set(submissionRef") && voting.includes("transaction.set(leaderboardRef"));
console.log("atomic DoroCoin balance and vote checks passed");
