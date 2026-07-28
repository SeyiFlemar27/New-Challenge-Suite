import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");
assert(detail.includes('href={`/challenges/${challengeId}/join`}') || detail.includes('/join'), "Submit Entry should route to join page");
assert(join.includes("canSubmitNow ?") && join.includes("SubmissionAccessCard"), "join page must hide upload form unless canSubmit is true");
assert(join.includes("Register for Challenge") && join.includes("Enter Challenge"), "join page must expose clear registration and entry actions");
console.log("submission action routing checks passed");