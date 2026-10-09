import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const rules = read("lib/server/economy-rules.ts");
const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(voting.includes("DOROCOIN_COST_PER_VOTE = 5"));
assert(voting.includes("doroCoinWallets"));
assert(voting.includes("quantity * paidVoteCostDoroCoins"));
assert(page.includes("5 DoroCoins per additional vote") && page.includes("votes x 5 DC"));
assert(!page.includes("Challenge Credits"));
console.log("canonical DoroCoin vote cost checks passed");
