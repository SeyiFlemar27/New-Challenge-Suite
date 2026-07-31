import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(voting.includes("DOROCOIN_COST_PER_VOTE = 5"));
assert(voting.includes("quantity * DOROCOIN_COST_PER_VOTE"));
assert(page.includes("votes * 5") && page.includes("5 DoroCoins per additional vote"));
console.log("DoroCoin five-per-vote checks passed");
