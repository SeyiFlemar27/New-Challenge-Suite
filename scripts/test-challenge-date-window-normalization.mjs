import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const status = readFileSync("lib/challenge-status.ts", "utf8");
for (const field of ["registrationEndAt", "submissionStartAt", "submissionDeadline", "submissionEndAt", "votingStartAt", "votingEndAt"]) {
  assert(status.includes(field), `${field} must be normalized`);
}
assert(status.includes('submissionOpensAt') && status.includes('?? registrationClosesAt'), "submission start must fall back to registration close");
assert(status.includes('const votingOpensAt') && status.includes('?? submissionClosesAt'), "voting start must fall back to submission deadline");
assert(status.includes('boundary === "end" ? "23:59:59.999" : "00:00:00.000"'), "date-only fallback boundaries must remain explicit");
console.log("challenge date window normalization checks passed");
