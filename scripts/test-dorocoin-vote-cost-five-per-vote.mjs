import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const rules = read("lib/server/economy-rules.ts");
const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(voting.includes("economyRules.voting.paidVoteCostCredits"));
assert(rules.includes("quantity)) * rules.voting.paidVoteCostCredits"));
assert(page.includes("10 Challenge Credits per additional vote") && page.includes("votes x 10 Credits"));
assert(!page.includes("DoroCoins per additional vote"));
console.log("legacy DoroCoin vote cost retirement checks passed");
