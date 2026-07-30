import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");
assert(builder.includes("submissionStartAt: challengeSubmissionStartAt"));
assert(builder.includes("startsAt: challengeSubmissionStartAt"));
assert(status.includes('"submissionStartAt", "submissionOpensAt"'));
assert(status.includes('"challengeStartsAt", "startsAt"'));
console.log("submission opening uses Challenge/Submissions start checks passed");
