import fs from "node:fs";
const bonus = fs.readFileSync("app/challenges/[id]/bonus-votes/page.tsx", "utf8");
for (const token of ["Bonus votes are not available yet.", "Voting must open before DoroCoin bonus votes can be used.", "No eligible submissions are available for bonus votes yet."]) {
  if (!bonus.includes(token)) throw new Error(`Missing bonus vote unavailable state: ${token}`);
}
if (bonus.includes("Invalid server response")) throw new Error("Expected lifecycle blockers must not show a transport error.");
console.log("DoroCoin bonus vote unavailable-state checks passed.");
