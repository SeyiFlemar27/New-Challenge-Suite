import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const flow = read("lib/server/challenge-production-flow.ts");
const proposals = read("app/api/challenges/[id]/winner-proposals/route.ts");
assert(flow.includes("canCloseSubmission") && flow.includes("canOpenVoting") && flow.includes("canCloseVoting") && flow.includes("canStartWinnerReview") && flow.includes("canAnnounceWinners") && flow.includes("canCompleteChallenge"), "challenge close/review lifecycle helper functions must exist");
assert(flow.includes("SUBMISSIONS_CLOSED") && flow.includes("VOTING_OPENED") && flow.includes("WINNER_REVIEW_STARTED"), "sensitive lifecycle actions must have audit event names");
assert(flow.includes("buildPreliminaryResultFoundation") && flow.includes("not_enough_approved_submissions"), "preliminary result calculation foundation must validate blockers");
assert(proposals.includes("pending_admin_review") && proposals.includes("canProposeChallengeWinners"), "creator winner proposal must remain admin-review gated");
console.log("challenge close winner review flow checks passed");