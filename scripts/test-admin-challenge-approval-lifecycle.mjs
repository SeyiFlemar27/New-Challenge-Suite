import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const lifecycle = readFileSync(join(root, "lib/server/challenge-lifecycle.ts"), "utf8");
const operations = readFileSync(join(root, "app/api/admin/operations/route.ts"), "utf8");
const reviews = readFileSync(join(root, "app/api/admin/reviews/route.ts"), "utf8");
const payout = readFileSync(join(root, "lib/server/payout-structure.ts"), "utf8");

assert(lifecycle.includes("resolveApprovedChallengeStatus"), "approved challenge status must be centralized in lifecycle helper.");
assert(lifecycle.includes("buildChallengeApprovalUpdate"), "admin approval update helper must exist.");
assert(lifecycle.includes("buildChallengeRejectionUpdate"), "admin rejection update helper must exist.");
assert(lifecycle.includes('publishedAt: challenge.publishedAt ?? now'), "approval must set publishedAt when missing without overwriting an existing value.");
assert(lifecycle.includes('adminReviewRequired: false'), "approval must clear adminReviewRequired.");
assert(lifecycle.includes('lifecycleStatus: approvedStatus'), "approval must synchronize lifecycleStatus.");
assert(lifecycle.includes('reviewedBy: adminId') && lifecycle.includes('reviewedAt: now'), "approval must record reviewer metadata.");
assert(lifecycle.includes('return "scheduled"') && lifecycle.includes('return "submission_open"') && lifecycle.includes('return "voting_open"'), "approved status must preserve timeline-sensitive states.");

assert(operations.includes('buildChallengeApprovalUpdate(challenge, user.uid, now)'), "visible admin operation approval must use shared approval helper.");
assert(operations.includes('buildChallengeRejectionUpdate(user.uid, now)'), "visible admin operation rejection must use shared rejection helper.");
assert(!operations.includes('challenge: { collection: "challenges", statusField: "status" }'), "challenge approval must not use generic status-only operation path.");
assert(operations.includes('writeAuditLog'), "visible admin operation must continue writing audit logs.");
assert(operations.includes('before: { status: previousStatus }') && operations.includes('after: { status, moneyMovementEnabled: false }'), "visible admin operation audit must record status transition.");

assert(reviews.includes('buildChallengeApprovalUpdate(challenge, user.uid, now)'), "legacy review route must use shared approval helper.");
assert(reviews.includes('buildChallengeRejectionUpdate(user.uid, now)'), "legacy review route must use shared rejection helper.");
assert(!reviews.includes('status: approved ? "scheduled" : "draft"'), "legacy review route must not hard-code a contradictory approval status.");
assert(reviews.includes('writeAuditLog'), "legacy review route must continue writing audit logs.");

assert(payout.includes('Boolean(challenge.publishedAt) || ["published", "scheduled", "registration_not_open", "registration_open", "active", "submission_open", "voting_open"].includes(status)'), "sponsor funding window must still accept publishedAt or approved/open lifecycle statuses.");

console.log("Admin challenge approval lifecycle checks passed.");