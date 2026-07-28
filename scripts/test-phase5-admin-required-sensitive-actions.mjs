import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("ADMIN_REVIEW_REQUIRED"), "missing " + "ADMIN_REVIEW_REQUIRED");
assert(source.includes("sensitiveAfterVoting"), "missing " + "sensitiveAfterVoting");
assert(source.includes("adminReviewRequired"), "missing " + "adminReviewRequired");
console.log("test-phase5-admin-required-sensitive-actions checks passed");
