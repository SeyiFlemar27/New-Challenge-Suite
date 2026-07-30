import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const createRoute = readFileSync("app/api/challenges/route.ts", "utf8");
assert(!builder.includes("votingStartsAt: form.submissionDeadline"));
assert(!createRoute.includes("body.votingStartsAt || body.submissionDeadline"));
assert(builder.includes("submissionDeadline,"));
assert(builder.includes("submissionStartAt: challengeSubmissionStartAt"));
console.log("submission deadline is not reused as start checks passed");
