import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(voting.includes("MAX_DOROCOIN_VOTES_PER_REQUEST = 100"));
assert(!/lifetime.*(?:limit|cap)/i.test(voting));
assert(page.includes("vote again in separate transactions"));
console.log("DoroCoin repeat voting checks passed");
