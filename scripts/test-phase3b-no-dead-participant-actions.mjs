import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/page.tsx");
const join = read("app/challenges/[id]/join/page.tsx");
for (const token of ["pay_entry_fee", "refresh_payment", "wait_for_submission", "submit_entry", "view_entry", "manage_challenge", "sign_in"]) assert(page.includes(token));
assert(join.includes("SubmissionAccessCard") && join.includes("Back to Challenge"));
console.log("Phase 3B no-dead-action checks passed.");
