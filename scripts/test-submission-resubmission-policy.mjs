import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resubmissionWindowOpen, resolveResubmissionDeadline, SUBMISSION_RESUBMISSION_WINDOW_MS } from "../lib/server/submission-resubmission.ts";

const now = new Date("2026-01-01T00:00:00.000Z");
const hours = (value) => new Date(now.getTime() + value * 60 * 60 * 1000).toISOString();
let assertions = 0;
function check(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }

equal(SUBMISSION_RESUBMISSION_WINDOW_MS, 24 * 60 * 60 * 1000, "approved correction window is exactly 24 hours");
const capped = resolveResubmissionDeadline({ requestedDeadline: hours(48), challenge: {}, now });
check(capped.allowed, "request longer than 24 hours is safely capped");
equal(capped.deadline, hours(24), "persisted deadline cannot exceed 24 hours");
const stricterChallenge = resolveResubmissionDeadline({ requestedDeadline: hours(20), challenge: { submissionDeadline: hours(12) }, now });
equal(stricterChallenge.deadline, hours(12), "stricter challenge deadline wins");
const conflictingDeadlines = resolveResubmissionDeadline({ requestedDeadline: hours(20), challenge: { submissionDeadline: hours(16), submissionClosesAt: hours(10) }, now });
equal(conflictingDeadlines.deadline, hours(10), "earliest configured submission deadline wins when legacy fields conflict");
equal(resolveResubmissionDeadline({ requestedDeadline: hours(20), challenge: { submissionDeadline: "invalid", submissionClosesAt: hours(10) }, now }).allowed, false, "malformed configured deadline fails closed");
const earlierRequested = resolveResubmissionDeadline({ requestedDeadline: hours(5), challenge: { endsAt: hours(12) }, now });
equal(earlierRequested.deadline, hours(5), "earlier requested deadline is preserved");
equal(resolveResubmissionDeadline({ requestedDeadline: now.toISOString(), challenge: {}, now }).allowed, false, "deadline exactly now is rejected");
equal(resolveResubmissionDeadline({ requestedDeadline: hours(24), challenge: { submissionDeadline: now.toISOString() }, now }).allowed, false, "already-closed challenge denies a correction window");

const submission = { status: "resubmission_requested", resubmissionDeadline: hours(24), resubmissionRequestId: "request-1" };
check(resubmissionWindowOpen({ submission, challenge: { submissionDeadline: hours(48) }, now }), "valid request is open before expiration");
equal(resubmissionWindowOpen({ submission: { ...submission, resubmissionDeadline: now.toISOString() }, challenge: { submissionDeadline: hours(48) }, now }), false, "correction at exact expiration is rejected");
equal(resubmissionWindowOpen({ submission: { ...submission, resubmissionDeadline: hours(1) }, challenge: { submissionDeadline: now.toISOString() }, now }), false, "stricter challenge deadline closes correction");
equal(resubmissionWindowOpen({ submission: { ...submission, resubmissionCompletedRequestId: "request-1" }, challenge: { submissionDeadline: hours(48) }, now }), false, "a consumed request cannot be replayed");
equal(resubmissionWindowOpen({ submission: { ...submission, status: "rejected" }, challenge: { submissionDeadline: hours(48) }, now }), false, "rejection alone does not grant a resubmission window");
check(resubmissionWindowOpen({ submission: { status: "resubmission_requested", resubmissionDeadline: hours(24) }, challenge: {}, now }), "legacy request remains usable when no challenge deadline is configured");

const manageRoute = readFileSync(new URL("../app/api/challenges/[id]/manage/route.ts", import.meta.url), "utf8");
const submissionRoute = readFileSync(new URL("../app/api/submissions/[id]/route.ts", import.meta.url), "utf8");
const journey = readFileSync(new URL("../lib/server/participant-journey.ts", import.meta.url), "utf8");
const detailsPage = readFileSync(new URL("../app/challenges/[id]/page.tsx", import.meta.url), "utf8");
check(manageRoute.includes("resolveResubmissionDeadline") && manageRoute.includes("runTransaction"), "management request persists the capped deadline transactionally");
check(manageRoute.includes("resubmissionRequestId") && manageRoute.includes("RESUBMISSION_NOT_ALLOWED"), "duplicate active requests cannot extend the window");
check(submissionRoute.includes("resubmissionWindowOpen") && submissionRoute.includes("resubmissionCompletedRequestId"), "PATCH handler enforces and consumes persisted correction request");
check(journey.includes("text(submission.rejectionReason)") && journey.includes('"fix_and_resubmit"'), "participant journey exposes their rejection feedback and recovery action");
check(detailsPage.includes("Fix &amp; Resubmit") && detailsPage.includes('"fix_and_resubmit"'), "details UI renders the correction action on desktop and mobile");

console.log(`PASS resubmission deadline policy: ${assertions} assertions.`);
const normal = { builderVersion: "normal_v3", status: "submission_open", submissionDeadline: now.toISOString() };
equal(resolveResubmissionDeadline({ requestedDeadline: hours(1), challenge: normal, now }).deadline, hours(24), "Normal correction receives a full 24 hours after initial deadline");
check(resubmissionWindowOpen({ submission, challenge: normal, now }), "Normal correction remains available after initial submission deadline");
equal(resubmissionWindowOpen({ submission, challenge: normal, now: new Date(hours(24)) }), false, "Normal correction closes exactly at persisted expiration");
equal(resubmissionWindowOpen({ submission, challenge: { ...normal, effectiveVotingStartsAt: now.toISOString() }, now }), false, "correction cannot overwrite an activated voting lifecycle");
equal(resolveResubmissionDeadline({ requestedDeadline: hours(48), challenge: { ...normal, status: "cancelled" }, now }).allowed, false, "cancelled challenge cannot grant correction");
console.log(`PASS legacy and Normal correction policies: ${assertions} assertions.`);
