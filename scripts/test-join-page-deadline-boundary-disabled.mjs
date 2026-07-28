import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");

assert(join.includes("Date.now() >= closesAt"), "join page must treat the exact deadline as expired");
assert(join.includes("setSubmissionWindowExpired(true)"), "deadline timer must revoke stale client access");
assert(join.includes("void refetch();"), "deadline timer must refetch canonical backend state");
assert(join.includes("backendCanSubmit && !submissionWindowExpired && !checkingSubmissionAccess"), "join page must disable submission at deadline even before refetch completes");
assert(/disabled=\{[^}]*!canSubmitNow/.test(join), "Submit Entry button must be disabled when canonical access is unavailable");
assert(join.includes("submissionAccess?.message"), "join page must display the backend blocker reason");
assert(!join.includes('setError("Submissions are not open yet.")'), "exact-deadline UI must not use a contradictory not-open hardcode");
console.log("join page exact-deadline disabled checks passed");
