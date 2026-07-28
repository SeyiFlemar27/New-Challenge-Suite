import fs from "node:fs";
const journey = fs.readFileSync("lib/server/participant-journey.ts", "utf8");
const page = fs.readFileSync("app/challenges/[id]/page.tsx", "utf8");
if (!journey.includes("No eligible submissions are available for voting yet.") || !journey.includes('phase.phase === "voting_pending"')) throw new Error("Voting pending must be passive.");
if (!page.includes("votingOpen && eligibleSubmissionCount > 0")) throw new Error("View Voting must require eligible submissions.");
console.log("No-eligible-submission voting checks passed.");
