import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

function read(path) { return readFileSync(path, "utf8"); }

assert(existsSync("lib/server/challenge-drafts.ts"), "challenge draft helper must exist");
assert(existsSync("lib/server/challenge-viewer-state.ts"), "viewer state helper must exist");
assert(existsSync("app/api/challenges/drafts/route.ts"), "draft create/list route must exist");
assert(existsSync("app/api/challenges/drafts/[id]/route.ts"), "draft load/autosave route must exist");
assert(existsSync("app/api/challenges/[id]/publish/route.ts"), "server publish route must exist");
assert(existsSync("app/api/challenges/[id]/entry-request/route.ts"), "entry request route must exist");
assert(existsSync("app/api/challenges/[id]/entry-request/[requestId]/approve/route.ts"), "entry request approve route must exist");
assert(existsSync("app/api/challenges/[id]/entry-request/[requestId]/reject/route.ts"), "entry request reject route must exist");

const builder = read("components/challenge-builder.tsx");
assert(builder.includes("fetchChallengeDraft"), "builder must load persisted draft");
assert(builder.includes("updateChallengeDraft"), "builder must autosave persisted draft");
assert(builder.includes("publishChallengeDraft"), "builder must publish existing draft");
assert(builder.includes("window.localStorage.setItem(recoveryKey"), "builder must keep local crash recovery");
assert(builder.includes("Saving...") && builder.includes("Saved") && builder.includes("Save failed - retry"), "builder must expose autosave states");

const createPage = read("app/challenges/create/page.tsx");
assert(createPage.includes("createChallengeDraft"), "create entry page must create server draft first");
assert(createPage.includes("router.replace(`/challenges/create/${id}`)"), "create entry page must redirect to draft edit route");

const management = read("app/challenges/page.tsx");
for (const label of ["Active", "Pending Review", "Requires Changes", "Scheduled", "Drafts", "Completed", "Cancelled"]) {
  assert(management.includes(label), `management tab ${label} missing`);
}
assert(management.includes("Continue Editing"), "draft tab must support continue editing");
assert(management.includes("completionPercentage"), "draft card must show real completion progress");

const viewer = read("lib/server/challenge-viewer-state.ts");
for (const code of ["AUTH_REQUIRED", "SPONSOR_NOT_ALLOWED", "SELF_ENTRY_NOT_ALLOWED", "PAYMENT_REQUIRED", "SUBMISSION_ALREADY_EXISTS", "VOTING_CLOSED", "DAILY_FREE_VOTE_USED"]) {
  assert(viewer.includes(code), `viewer state must define ${code}`);
}
assert(viewer.includes("resolveChallengeViewerState"), "viewer state resolver missing");
assert(viewer.includes("evaluateChallengeEligibility"), "eligibility evaluator missing");

const challengeDetailApi = read("app/api/challenges/[id]/route.ts");
assert(challengeDetailApi.includes("resolveChallengeViewerState"), "challenge detail API must use viewer state resolver");
assert(challengeDetailApi.includes("viewerState"), "challenge detail API must return viewerState");

const joinRoute = read("app/api/challenges/[id]/join/route.ts");
assert(joinRoute.includes("SELF_ENTRY_NOT_ALLOWED"), "join route must block self-entry");
assert(joinRoute.includes("ENTRY_REQUEST_REQUIRED"), "join route must route manual approval through entry request");
assert(joinRoute.includes("runTransaction"), "join must remain transactional");

const checkoutRoute = read("app/api/challenges/[id]/entry-checkout/route.ts");
assert(checkoutRoute.includes("SELF_ENTRY_NOT_ALLOWED"), "paid entry checkout must block self-entry");
assert(checkoutRoute.includes("ENTRY_REQUEST_APPROVAL_REQUIRED"), "manual paid entry must require approved request before checkout");
assert(!checkoutRoute.includes("amountCents") || checkoutRoute.includes("paidEntryAmountCents(challenge)"), "checkout amount must be derived server-side");

const payments = read("lib/server/monetization-payments.ts");
assert(payments.includes("winnerShareCents") && payments.includes("creatorHostOperatorShareCents") && payments.includes("platformFeeCents"), "paid-entry 65/20/15 accounting fields missing");
assert(payments.includes("challengeFinancialLedger"), "paid-entry ledger foundation must be recorded");
assert(payments.includes("payoutProviderCalled: false") && payments.includes("prizeReleased: false"), "paid-entry confirmation must not execute payout or prize release");

const submissions = read("app/api/submissions/route.ts");
assert(submissions.includes("SELF_ENTRY_NOT_ALLOWED"), "submission route must block self-submission");
assert(submissions.includes("NOT_ENROLLED_FOR_SUBMISSION"), "submission route must require participant enrollment");

const voting = read("lib/server/voting.ts");
assert(voting.includes("SELF_VOTING_NOT_ALLOWED"), "voting must block self-voting");
assert(voting.includes("voteDate"), "daily vote bucketing must remain server-side");

console.log("Production challenge draft, viewer-state, and participation foundation checks passed.");
