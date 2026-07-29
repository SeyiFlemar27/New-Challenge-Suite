import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "lib/server/challenge-validation.ts",
  "components/challenge-builder.tsx"
].map((path) => readFileSync(path, "utf8")).join("\n");

assert(files.includes("Registration or invite close must be before or at the challenge/submission start time."));
assert(files.includes("Submission deadline must be after the challenge/submission start time."));
assert(files.includes("Submission deadline must be before or at the voting/review close time."));
assert(files.includes("Winner announcement must be after voting/review closes."));
const retiredDeadlineCopy = ["Submission deadline must be before", "the challenge begins."].join(" ");
assert(!files.includes(retiredDeadlineCopy));
assert(!files.includes("Voting cannot start before the submission deadline."), "submission and voting overlap must remain allowed.");

console.log("Create challenge publish validation copy checks passed.");
