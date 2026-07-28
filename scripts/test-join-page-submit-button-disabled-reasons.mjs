import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");
const access = readFileSync("lib/server/challenge-viewer-state.ts", "utf8");

assert(join.includes("if (!canSubmitNow)"), "submit handler must reject when backend access is false");
assert(join.includes('setError(submissionAccess?.message ?? "Submission is not available.")'), "blocked submit must show the backend reason");
assert(/disabled=\{[^}]*!canSubmitNow[^}]*submitting/.test(join), "final submit button must be disabled with backend access");
for (const reason of ["payment_pending", "payment_required", "not_enrolled", "submission_not_open", "submission_closed", "self_entry_not_allowed", "sponsor_blocked", "already_submitted"]) {
  assert(access.includes(`"${reason}"`), `missing submission blocker: ${reason}`);
}
console.log("join page disabled-reason consistency checks passed");
