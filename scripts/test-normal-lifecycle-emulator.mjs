import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { processNormalChallengeLifecycle } from "../lib/server/normal-lifecycle-jobs.ts";
import { normalVotingSchedule } from "../lib/server/normal-lifecycle-policy.ts";
import { canVoteOnChallenge } from "../lib/challenge-status.ts";
import { moderateNormalSubmission } from "../lib/server/normal-submission-moderation.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `normal_lifecycle_${randomUUID()}`;
const now = new Date("2026-10-14T12:00:00Z");
const hour = offset => new Date(now.getTime() + offset * 3_600_000).toISOString();
const ids = [];
let count = 0;
const equal = (actual, expected, name) => { assert.equal(actual, expected, name); count++; };
async function setup(label, submission = null, changes = {}) {
  const id = `${prefix}_${label}`; ids.push(id);
  const record = { id, builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, creatorId: "fixture_creator", status: "submission_open", publishedAt: hour(-50), normalVotingGate: "moderation_pending", submissionStartAt: hour(-48), startsAt: hour(-48), submissionDeadline: hour(-2), votingStartsAt: hour(-1), votingDeadline: hour(23), endsAt: hour(24), numberOfWinners: 3, ...changes };
  await db.collection("challenges").doc(id).set(record);
  if (submission) {
    await db.collection("submissions").doc(id).set({ id, challengeId: id, userId: "fixture_participant", title: "Fixture entry", status: "approved", moderationStatus: "approved", revisionNumber: 1, submittedAt: hour(-25), ...submission });
    await db.collection("challengeParticipants").doc(`${id}_fixture_participant`).set({ challengeId: id, userId: "fixture_participant", status: "active" });
  }
  return id;
}
try {
  const protectedCorrection = await setup("protected_correction", { status: "resubmission_requested", resubmissionRequestId: "fixture_request", resubmissionDeadline: hour(2) });
  await assert.rejects(moderateNormalSubmission(db, { challengeId: protectedCorrection, submissionId: protectedCorrection, actorId: "fixture_creator", admin: false, action: "reject", reason: "Reject before correction expires", now }), /CORRECTION_WINDOW_ACTIVE/); count++;
  equal((await db.collection("submissions").doc(protectedCorrection).get()).data().status, "resubmission_requested", "initial correction opportunity remains intact");
  await assert.rejects(moderateNormalSubmission(db, { challengeId: protectedCorrection, submissionId: protectedCorrection, actorId: "foreign_creator", admin: false, action: "approve", reason: "Unauthorized decision", now }), /PERMISSION_DENIED/); count++;
  const pending = await setup("pending", { status: "pending_review", moderationStatus: "pending_review" });
  equal((await processNormalChallengeLifecycle(db, pending, now)).waiting, "moderation_or_appeal", "pending moderation blocks voting");
  equal((await db.collection("adminActionTasks").doc(`normal_initial_review_${pending}`).get()).exists, true, "overdue review escalates");
  await db.collection("adminActionTasks").doc(`normal_initial_review_${pending}`).update({ status: "under_review", createdAt: hour(-1) });
  await processNormalChallengeLifecycle(db, pending, now);
  equal((await db.collection("adminActionTasks").doc(`normal_initial_review_${pending}`).get()).data().status, "under_review", "worker retry preserves existing investigation state");
  equal((await db.collection("adminActionTasks").doc(`normal_initial_review_${pending}`).get()).data().createdAt, hour(-1), "worker retry preserves investigation creation timestamp");
  const appeal = await setup("appeal", { status: "rejected", appealDeadline: hour(1) });
  equal((await processNormalChallengeLifecycle(db, appeal, now)).waiting, "moderation_or_appeal", "valid appeal filing window blocks voting");
  const openAppeal = await setup("open_appeal", { status: "rejected", appealDeadline: hour(-1), appealStatus: "submitted" });
  equal((await processNormalChallengeLifecycle(db, openAppeal, now)).waiting, "moderation_or_appeal", "filed appeal remains blocking after filing deadline");
  const corrected = await setup("clean", { status: "pending_review", moderationStatus: "pending_review", resubmissionCompletedAt: hour(-0.2), correctionAutoReviewAt: hour(-0.1), serverMediaVerifiedAt: hour(-0.2), mediaStoragePath: "fixture/corrected.jpg", safetyReviewStatus: "pending" });
  await db.collection("submissionSafetyReviews").doc(corrected).set({ status: "clean", trusted: true, revisionNumber: 1, mediaStoragePath: "fixture/corrected.jpg" });
  equal((await processNormalChallengeLifecycle(db, corrected, now)).votingOpened, true, "trusted clean corrected revision opens voting after review");
  const current = (await db.collection("challenges").doc(corrected).get()).data();
  equal(Date.parse(current.effectiveVotingEndsAt) - Date.parse(current.effectiveVotingStartsAt), 24 * 3_600_000, "delay preserves full configured voting duration");
  equal(canVoteOnChallenge(current, now), true, "activated schedule permits voting");
  const slowWorker = await setup("slow_activation", {});
  let clockReads = 0;
  const activatedAt = new Date(now.getTime() + 60_000);
  await processNormalChallengeLifecycle(db, slowWorker, () => clockReads++ === 0 ? now : activatedAt);
  equal((await db.collection("challenges").doc(slowWorker).get()).data().effectiveVotingStartsAt, activatedAt.toISOString(), "effective activation uses the transaction decision clock rather than worker start");
  equal((await processNormalChallengeLifecycle(db, corrected, now)).waiting, "voting_end", "duplicate worker does not restart duration");
  const stale = await setup("stale_safety", { status: "pending_review", resubmissionCompletedAt: hour(-0.2), correctionAutoReviewAt: hour(-0.1), serverMediaVerifiedAt: hour(-0.2), mediaStoragePath: "fixture/new.jpg" });
  await db.collection("submissionSafetyReviews").doc(stale).set({ status: "clean", trusted: true, revisionNumber: 0, mediaStoragePath: "fixture/old.jpg" });
  equal((await processNormalChallengeLifecycle(db, stale, now)).waiting, "moderation_or_appeal", "stale clean scan cannot approve current correction");
  const refunded = await setup("refunded_correction", { status: "pending_review", resubmissionCompletedAt: hour(-0.2), correctionAutoReviewAt: hour(-0.1), serverMediaVerifiedAt: hour(-0.2), mediaStoragePath: "fixture/refunded.jpg" }, { paidEntryEnabled: true });
  await db.collection("challengeParticipants").doc(`${refunded}_fixture_participant`).update({ entryPaymentStatus: "refunded" });
  await db.collection("submissionSafetyReviews").doc(refunded).set({ status: "clean", trusted: true, revisionNumber: 1, mediaStoragePath: "fixture/refunded.jpg" });
  await processNormalChallengeLifecycle(db, refunded, now);
  equal((await db.collection("submissions").doc(refunded).get()).data().status, "pending_review", "trusted clean evidence cannot restore refunded paid eligibility");
  await assert.rejects(moderateNormalSubmission(db, { challengeId: refunded, submissionId: refunded, actorId: "fixture_creator", admin: false, action: "approve", reason: "Review approved", now }), /PARTICIPANT_NOT_ELIGIBLE/); count++;
  const adminRejected = await setup("admin_rejected", { status: "rejected", resubmissionCompletedAt: hour(-0.2), correctionAutoReviewAt: hour(-0.1), appealDeadline: hour(2) });
  await db.collection("submissionSafetyReviews").doc(adminRejected).set({ status: "clean", trusted: true, revisionNumber: 1 });
  await processNormalChallengeLifecycle(db, adminRejected, now);
  equal((await db.collection("submissions").doc(adminRejected).get()).data().status, "rejected", "worker cannot overwrite later Admin rejection");
  const none = await setup("none");
  const outcomes = await Promise.all([processNormalChallengeLifecycle(db, none, now), processNormalChallengeLifecycle(db, none, now)]);
  equal(outcomes.filter(outcome => outcome.noWinners).length, 1, "concurrent No Winners processing commits once");
  equal((await db.collection("challenges").doc(none).get()).data().normalOutcome, "no_winners", "no submissions completes explicitly");
  equal((await db.collection("winners").where("challengeId", "==", none).get()).size, 0, "No Winners creates no fictitious winners");
  equal((await db.collection("challenges").doc(none).get()).data().settlementRestricted, true, "No Winners funds remain held");
  const zero = await setup("zero_votes", {}, { status: "voting_open", normalVotingGate: "ready", effectiveVotingStartsAt: hour(-25), effectiveVotingEndsAt: hour(-1) });
  equal((await processNormalChallengeLifecycle(db, zero, now)).noWinners, true, "zero valid votes after full voting produces No Winners");
  const one = await setup("one", {}, { status: "voting_open", normalVotingGate: "ready", effectiveVotingStartsAt: hour(-25), effectiveVotingEndsAt: hour(-1) });
  await db.collection("votes").doc(one).set({ challengeId: one, submissionId: one, status: "counted" });
  equal((await processNormalChallengeLifecycle(db, one, now)).candidateCount, 1, "one valid vote creates eligible candidate");
  equal((await db.collection("challenges").doc(one).get()).data().status, "under_review", "worker does not auto-announce winner");
  equal((await db.collection("normalNotificationOutbox").doc(`${none}_voting_finalized`).get()).data().type, "normal_no_winners", "No Winners outcome queues an accurate durable notice");
  equal((await db.collection("normalNotificationOutbox").doc(`${one}_voting_finalized`).get()).data().type, "normal_results_review", "result notice does not claim Admin approval");
  equal(normalVotingSchedule({ votingStartsAt: hour(1), votingDeadline: hour(2) }, now), null, "worker cannot open before scheduled voting time");
  const invalidSchedule = await setup("invalid_schedule", {}, { status: "voting_open", normalVotingGate: "ready", effectiveVotingStartsAt: hour(-25), effectiveVotingEndsAt: "invalid" });
  equal((await processNormalChallengeLifecycle(db, invalidSchedule, now)).waiting, "invalid_voting_schedule", "malformed voting end cannot finalize results");
  equal((await db.collection("normalLifecycleEvents").doc(`${invalidSchedule}_voting_finalized`).get()).exists, false, "invalid schedule creates no final snapshot");
  console.log(`Normal lifecycle emulator: ${count} assertions passed.`);
} finally {
  for (const id of ids) {
    for (const collection of ["submissions", "challengeParticipants", "votes", "submissionSafetyReviews", "challenges"]) await db.collection(collection).doc(id).delete();
    await db.collection("challengeParticipants").doc(`${id}_fixture_participant`).delete();
    for (const collection of ["normalLifecycleEvents", "normalNotificationOutbox", "adminActionTasks", "auditLogs"]) {
      const matching = await db.collection(collection).where("challengeId", "==", id).get();
      await Promise.all(matching.docs.map(document => document.ref.delete()));
    }
  }
  await deleteApp(app);
}
