import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
assert(page.includes("pendingSubmissionCount"));
assert(page.includes("pendingEntryRequestCount"));
assert(page.includes("pendingReportCount"));
assert(page.includes("pendingSponsorRequestCount"));
assert(page.includes("attention.length ?"));
assert(page.includes('/manage`'));
assert(!page.includes("Awaiting activity"));
console.log("host attention rows are real-count driven and link to exact management: ok");
