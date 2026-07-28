import fs from "node:fs";
const status = fs.readFileSync("lib/challenge-status.ts", "utf8");
if (status.includes("!liveVotingDuringSubmission && submissionStatus")) throw new Error("Voting must support configured overlap with submissions.");
if (!status.includes("const votingWindowOpen") || !status.includes("if (!submissionOpen && votingOpen)")) throw new Error("Independent voting window state is required.");
console.log("Voting/submission overlap checks passed.");
