import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
assert(voting.includes("db.runTransaction"));
assert(voting.includes("balance: balance - creditCost"));
assert(voting.includes('sourceType: "paid_vote_spend"'));
assert(voting.includes("transaction.set(submissionRef") && voting.includes("transaction.set(leaderboardRef"));
assert(!voting.includes("dorocoinWallets"));
console.log("atomic Challenge Credit balance and vote checks passed");
