import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
assert(voting.includes("userOwnsChallenge(challenge, input.userId)"));
assert(voting.includes("You cannot vote on your own challenge."));
console.log("creator voting restriction checks passed");
