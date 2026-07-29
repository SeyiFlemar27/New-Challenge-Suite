import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
assert(!voting.includes('collection("challengeParticipants")'));
assert(!voting.includes('collection("challengeEnrollments")'));
assert(voting.includes("if (!submissionSnap.exists)"));
assert(voting.includes("transaction.set(submissionRef"));
assert(!voting.includes('db.collection("submissions").doc()'));
console.log("vote write isolation checks passed");
