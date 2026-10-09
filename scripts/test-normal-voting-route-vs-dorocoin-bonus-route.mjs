import fs from "node:fs";
const normal = fs.readFileSync("app/challenges/[id]/votes/page.tsx", "utf8");
const bonus = fs.readFileSync("app/challenges/[id]/bonus-votes/page.tsx", "utf8");
if (!normal.includes('voteMode: "free"') || normal.includes("Confirm DoroCoin Votes")) throw new Error("/votes must be normal free voting.");
if (!bonus.includes("Confirm DoroCoin Votes") || !bonus.includes("Additional Votes")) throw new Error("/bonus-votes must use canonical DoroCoin tools.");
if (bonus.includes("Challenge Credits") || bonus.includes('voteMode: "credits"')) throw new Error("/bonus-votes must not spend retired Challenge Credits.");
console.log("Normal and DoroCoin bonus voting route checks passed.");
