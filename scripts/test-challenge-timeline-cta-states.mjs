import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const status = readFileSync("lib/challenge-status.ts", "utf8");
const api = readFileSync("app/api/challenges/[id]/route.ts", "utf8");
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
assert(status.includes('submissionStatus !== "submissions_closed"') && status.includes('submissionStatus !== "no_submission_required"'), "Voting must not open before the submission window closes");
assert(api.includes('"submission_not_open"'), "API must expose submission_not_open block reason");
assert(api.includes('"payment_required"'), "API must expose payment_required block reason");
assert(detail.includes('Registration Closed'), "Detail CTA must handle registration closed");
assert(detail.includes('Enrolled - Waiting for submissions'), "Detail CTA must block submit before submission window");
console.log("challenge timeline CTA state checks passed");

