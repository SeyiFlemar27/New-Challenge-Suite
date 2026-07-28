import fs from "node:fs";
const bonus = fs.readFileSync("app/challenges/[id]/bonus-votes/page.tsx", "utf8");
const unavailable = bonus.indexOf("if (!votingOpen)");
const tools = bonus.indexOf("Confirm DoroCoin Votes");
if (unavailable < 0 || tools < 0 || unavailable > tools) throw new Error("Bonus vote lifecycle guard must render before tools.");
console.log("Bonus votes hidden-before-open checks passed.");
