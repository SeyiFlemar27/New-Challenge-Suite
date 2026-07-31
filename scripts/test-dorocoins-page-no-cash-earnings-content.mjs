import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/dorocoins/page.tsx");
for (const copy of ["DoroCoins", "non-cash platform credits", "cannot be withdrawn or converted to cash"]) assert(source.includes(copy));
for (const forbidden of ["Withdraw Funds", "Available Funds", "Future Payments", "creator_challenge_earning"]) assert(!source.includes(forbidden));
console.log("DoroCoin page cash separation checks passed");
