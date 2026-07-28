import fs from "node:fs";
const status = fs.readFileSync("lib/challenge-status.ts", "utf8");
for (const token of ["publishedRecord", "needsDeadlineFallback", "24 * 60 * 60 * 1000", "submissionDeadlineFallbackApplied"]) {
  if (!status.includes(token)) throw new Error(`Missing legacy deadline fallback contract: ${token}`);
}
if (status.includes('"submissionEndDate", "deadline"')) throw new Error("Generic deadline must not be treated as submission close.");
console.log("Existing challenge submission deadline fallback checks passed.");
