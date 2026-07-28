import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");

assert(join.includes("phaseSummary?.submissionStartAt"), "join page must schedule against canonical submission start");
assert(join.includes("phaseSummary?.submissionDeadline"), "join page must schedule against canonical submission deadline");
assert(join.includes("setCheckingSubmissionAccess(true)") && join.includes("void refetch().finally"), "opening timer must refetch backend access");
assert(join.includes("setSubmissionWindowExpired(true)") && join.includes("void refetch();"), "deadline timer must revoke stale access and refetch");
assert(join.includes("Checking submission access..."), "join page must expose the exact-time verification state");
assert(!join.includes("setCanSubmit"), "client timer must never force canSubmit");
console.log("join page exact-time refetch checks passed");
