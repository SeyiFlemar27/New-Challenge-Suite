import fs from "node:fs";
const page = fs.readFileSync("app/challenges/[id]/page.tsx", "utf8");
for (const token of ["SubmissionCountdown", "Submissions open in", "Checking submission access...", "Submit Entry"]) {
  if (!page.includes(token)) throw new Error(`Missing countdown transition contract: ${token}`);
}
console.log("Challenge submission countdown transition checks passed.");
