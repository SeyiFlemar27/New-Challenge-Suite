import fs from "node:fs";
const status = fs.readFileSync("lib/challenge-status.ts", "utf8");
const journey = fs.readFileSync("lib/server/participant-journey.ts", "utf8");
if (!status.includes('"timeline_needs_review"') || !journey.includes('"timeline_needs_review"')) throw new Error("Invalid timelines need a safe review state.");
console.log("Challenge invalid timeline review checks passed.");
