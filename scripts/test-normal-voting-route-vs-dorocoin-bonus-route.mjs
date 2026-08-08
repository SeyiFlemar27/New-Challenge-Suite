import fs from "node:fs";
const normal = fs.readFileSync("app/challenges/[id]/votes/page.tsx", "utf8");
const bonus = fs.readFileSync("app/challenges/[id]/bonus-votes/page.tsx", "utf8");
if (!normal.includes('voteMode: "free"') || normal.includes("Confirm DoroCoin Votes")) throw new Error("/votes must be normal free voting.");
if (!bonus.includes("Confirm Challenge Credit Votes") || !bonus.includes("Additional Votes")) throw new Error("/bonus-votes must contain Challenge Credit tools.");
if (bonus.includes("Confirm DoroCoin Votes") || bonus.includes("DoroCoin Bonus Votes")) throw new Error("/bonus-votes must not spend DoroCoins.");
console.log("Normal and Challenge Credit bonus voting route checks passed.");
