import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const normal = read("app/challenges/[id]/votes/page.tsx");
const bonus = read("app/challenges/[id]/bonus-votes/page.tsx");

assert(normal.includes('voteMode: "free"'));
assert(normal.includes("/bonus-votes"));
assert(!normal.includes("Confirm DoroCoin Votes"));
assert(bonus.includes('voteMutation.mutate("dorocoin")'));
assert(bonus.includes("Confirm DoroCoin Votes"));
console.log("Normal and bonus vote route separation checks passed.");
