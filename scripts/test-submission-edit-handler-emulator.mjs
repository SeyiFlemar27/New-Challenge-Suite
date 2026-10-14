import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "FIREBASE_STORAGE_EMULATOR_HOST is required");
const projectId = process.env.GCLOUD_PROJECT ?? "demo-challenge-suite";
const bucketName = `${projectId}.firebasestorage.app`;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = bucketName;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = bucketName;
const app = initializeApp({ projectId, storageBucket: bucketName });
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const testId = `submission_edit_${randomUUID().replaceAll("-", "")}`;
let assertionCount = 0;
function equal(actual, expected, message) { assertionCount += 1; assert.equal(actual, expected, message); }
function ok(condition, message) { assertionCount += 1; assert.ok(condition, message); }

async function newUser(label) {
  const email = `${testId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await auth.updateUser(body.localId, { emailVerified: true });
  const signedIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const signedInBody = await signedIn.json();
  assert.equal(signedIn.ok, true, JSON.stringify(signedInBody));
  await db.collection("users").doc(body.localId).set({ accountType: "creator", role: "creator" });
  return { uid: body.localId, token: signedInBody.idToken };
}

function jsonRequest(token, body, method = "PATCH") {
  return new Request("http://localhost/api/submissions/test_submission", { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}

try {
  const owner = await newUser("owner");
  const unrelated = await newUser("unrelated");
  const challengeId = `${testId}_challenge`;
  const submissionId = `${challengeId}_${owner.uid}`;
  const deadline = new Date(Date.now() + 60 * 60_000).toISOString();
  const challengeRef = db.collection("challenges").doc(challengeId);
  const submissionRef = db.collection("submissions").doc(submissionId);
  const participantRef = db.collection("challengeParticipants").doc(`${challengeId}_${owner.uid}`);
  const mediaPath = `challenges/${challengeId}/submissions/${owner.uid}/images/edit.jpg`;
  await challengeRef.set({ id: challengeId, creatorId: "another_creator", title: "Open submission edit", type: "Public Challenge", status: "active", visibility: "public", acceptedSubmissionTypes: ["image"], submissionStartAt: new Date(Date.now() - 60_000).toISOString(), submissionDeadline: deadline, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), votingStartsAt: deadline, votingDeadline: new Date(Date.now() + 90 * 60_000).toISOString(), winnerAnnouncementAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), paidEntryEnabled: false });
  await participantRef.set({ challengeId, userId: owner.uid, status: "active", entryPaymentStatus: "not_required" });
  await submissionRef.set({ id: submissionId, challengeId, userId: owner.uid, participantId: participantRef.id, status: "pending_review", title: "Original title", description: "Original description", mediaUrl: "https://firebasestorage.googleapis.com/v0/b/demo-challenge-suite.firebasestorage.app/o/old", mediaStoragePath: `challenges/${challengeId}/submissions/${owner.uid}/images/old.jpg`, mediaType: "image", fileSize: 3, revisionNumber: 0, reviewedAt: "2026-01-01T00:00:00.000Z", reviewedBy: "moderator_1", rejectionReason: null });
  await storage.bucket(bucketName).file(mediaPath).save(Buffer.from("image-bytes"), { resumable: false, metadata: { contentType: "image/jpeg" } });
  const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(mediaPath)}?alt=media&token=${testId}`;
  const { PATCH } = await import("../app/api/submissions/[id]/route.ts");
  const params = { params: Promise.resolve({ id: submissionId }) };
  const body = { title: "Updated title", description: "Updated caption", mediaUrl, mediaType: "image", originalFileName: "edit.jpg", fileSize: 11, mediaStoragePath: mediaPath, expectedRevision: 0 };
  const updateResponse = await PATCH(jsonRequest(owner.token, body), params);
  if (updateResponse.status !== 200) console.log("submission update diagnostic:", await updateResponse.json());
  equal(updateResponse.status, 200, "submission owner can update before deadline");
  const updated = (await submissionRef.get()).data();
  equal(updated.title, body.title, "new title persisted");
  equal(updated.revisionNumber, 1, "revision increments once");
  equal(updated.status, "pending_review", "existing moderation state is preserved");
  equal(updated.reviewedBy, "moderator_1", "moderation history remains intact");
  equal((await db.collection("submissionRevisions").doc(`${submissionId}_v1`).get()).exists, true, "immutable revision history record is created");
  equal((await PATCH(jsonRequest(owner.token, body), params)).status, 409, "stale concurrent retry cannot overwrite a newer revision");
  equal((await PATCH(jsonRequest(unrelated.token, { ...body, expectedRevision: 1 }), params)).status, 403, "unrelated user cannot edit the submission");
  const requestDeadline = new Date(Date.now() + 30 * 60_000).toISOString();
  await submissionRef.set({ status: "resubmission_requested", moderationStatus: "resubmission_requested", requestedChanges: "Replace the image caption.", resubmissionRequestId: "request-once", resubmissionDeadline: requestDeadline, resubmissionCompletedRequestId: null }, { merge: true });
  const correctionResponse = await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 1, title: "Corrected submission" }), params);
  equal(correctionResponse.status, 200, "owner can correct a requested resubmission before its persisted deadline");
  const corrected = (await submissionRef.get()).data();
  equal(corrected.status, "pending_review", "corrected submission returns to review");
  equal(corrected.resubmissionCompletedRequestId, "request-once", "resubmission request is consumed exactly once");
  equal(corrected.revisionNumber, 2, "correction creates the next revision");
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 1 }), params)).status, 409, "duplicate correction cannot replay a consumed request");
  await submissionRef.set({ status: "resubmission_requested", moderationStatus: "resubmission_requested", resubmissionRequestId: "request-expired", resubmissionDeadline: new Date(Date.now() - 1).toISOString(), resubmissionCompletedRequestId: null }, { merge: true });
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 2 }), params)).status, 409, "expired resubmission is rejected");
  equal((await PATCH(jsonRequest(unrelated.token, { ...body, expectedRevision: 2 }), params)).status, 403, "unauthorized user cannot use an open resubmission request");
  equal((await submissionRef.get()).data().revisionNumber, 2, "expired and unauthorized corrections create no revision");
  await challengeRef.set({ submissionDeadline: new Date(Date.now() - 1).toISOString() }, { merge: true });
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 2 }), params)).status, 409, "edit at or after the challenge deadline is rejected");
  equal((await submissionRef.get()).data().revisionNumber, 2, "deadline rejection writes no new revision");
  await challengeRef.set({ builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, normalVotingGate: "moderation_pending" }, { merge: true });
  await submissionRef.set({ status: "resubmission_requested", moderationStatus: "resubmission_requested", resubmissionRequestId: "normal-full-window", resubmissionCompletedRequestId: null, resubmissionDeadline: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }, { merge: true });
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 2 }), params)).status, 200, "Normal correction remains accepted after initial submission deadline");
  const normalCorrection = (await submissionRef.get()).data();
  equal(normalCorrection.revisionNumber, 3, "normal correction creates an immutable revision");
  equal(normalCorrection.safetyReviewStatus, "pending", "validated media is not fabricated as a clean safety scan");
  ok(Date.parse(normalCorrection.correctionAutoReviewAt) - Date.parse(normalCorrection.resubmissionCompletedAt) === 5 * 60_000, "correction review is due five minutes after server-confirmed correction");
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 3 }), params)).status, 409, "consumed correction cannot become a late ordinary edit");
  const delayedChallengeId = `${testId}_delayed_validation`;
  const delayedSubmissionId = `${delayedChallengeId}_${owner.uid}`;
  const delayedPath = `challenges/${delayedChallengeId}/submissions/${owner.uid}/images/delayed.jpg`;
  await db.collection("challenges").doc(delayedChallengeId).set({ ...(await challengeRef.get()).data(), id: delayedChallengeId });
  await db.collection("challengeParticipants").doc(delayedSubmissionId).set({ challengeId: delayedChallengeId, userId: owner.uid, status: "active", entryPaymentStatus: "not_required" });
  await db.collection("submissions").doc(delayedSubmissionId).set({ ...normalCorrection, id: delayedSubmissionId, challengeId: delayedChallengeId, participantId: delayedSubmissionId, revisionNumber: 0, status: "resubmission_requested", moderationStatus: "resubmission_requested", resubmissionRequestId: "delayed_validation_request", resubmissionCompletedRequestId: null, resubmissionCompletedAt: null });
  const delayedFile = storage.bucket(bucketName).file(delayedPath);
  await delayedFile.save(Buffer.from("image-bytes"), { resumable: false, metadata: { contentType: "image/jpeg" } });
  const nativeDate = globalThis.Date;
  let acceptedClock = nativeDate.now();
  function ControlledDate(...args) { return new nativeDate(...(args.length ? args : [acceptedClock])); }
  ControlledDate.prototype = nativeDate.prototype;
  Object.setPrototypeOf(ControlledDate, nativeDate);
  ControlledDate.now = () => acceptedClock;
  const metadataPrototype = Object.getPrototypeOf(delayedFile);
  const nativeGetMetadata = metadataPrototype.getMetadata;
  let delayedResponse;
  try {
    globalThis.Date = ControlledDate;
    metadataPrototype.getMetadata = async function (...args) { const result = await nativeGetMetadata.apply(this, args); if (this.name === delayedPath) acceptedClock += 1000; return result; };
    delayedResponse = await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 0, mediaStoragePath: delayedPath, mediaUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(delayedPath)}?alt=media` }), { params: Promise.resolve({ id: delayedSubmissionId }) });
  } finally { globalThis.Date = nativeDate; metadataPrototype.getMetadata = nativeGetMetadata; }
  equal(delayedResponse.status, 200, "valid correction survives deterministic media-validation latency");
  const delayedCorrection = (await db.collection("submissions").doc(delayedSubmissionId).get()).data();
  equal(Date.parse(delayedCorrection.resubmissionCompletedAt), acceptedClock, "correction completion records acceptance after media validation");
  equal(Date.parse(delayedCorrection.correctionAutoReviewAt) - acceptedClock, 5 * 60_000, "validation latency cannot shorten the five-minute review delay");
  equal(delayedCorrection.serverMediaVerifiedAt, delayedCorrection.resubmissionCompletedAt, "accepted media and revision share the transaction timestamp");
  const appealHandlers = await import("../app/api/submissions/[id]/appeal/route.ts");
  const finalRejectedAt = new Date().toISOString();
  await submissionRef.update({ status: "rejected", moderationStatus: "rejected", finalRejectedAt, appealDeadline: new Date(Date.now() - 1).toISOString() });
  const appealBody = { reason: "Please review the corrected submission evidence." };
  equal((await appealHandlers.POST(jsonRequest(owner.token, appealBody, "POST"), params)).status, 409, "expired final-rejection appeal cannot be filed");
  await submissionRef.update({ appealDeadline: new Date(Date.now() + 24 * 60 * 60_000).toISOString() });
  equal((await appealHandlers.POST(jsonRequest(unrelated.token, appealBody, "POST"), params)).status, 403, "unrelated participant cannot file the appeal");
  equal((await appealHandlers.POST(jsonRequest(owner.token, { reason: "short" }, "POST"), params)).status, 422, "appeal requires a meaningful reason");
  equal((await appealHandlers.POST(jsonRequest(owner.token, appealBody, "POST"), params)).status, 200, "owner can file within the persisted appeal window");
  equal((await appealHandlers.POST(jsonRequest(owner.token, appealBody, "POST"), params)).status, 200, "duplicate appeal returns the existing record");
  equal((await db.collection("appeals").where("submissionId", "==", submissionId).get()).size, 1, "duplicate appeal creates one authoritative case");
  const admin = await newUser("admin");
  await db.collection("users").doc(admin.uid).update({ isAdmin: true });
  const resolution = { reason: "Reviewed original and corrected evidence; approval is justified.", decision: "approve", confirmed: true };
  equal((await appealHandlers.PATCH(jsonRequest(owner.token, resolution), params)).status, 403, "participant cannot decide their own appeal");
  await participantRef.update({ status: "disqualified" });
  equal((await appealHandlers.PATCH(jsonRequest(admin.token, resolution), params)).status, 409, "Admin appeal cannot restore disqualified participation");
  equal((await db.collection("appeals").doc(`normal_submission_${submissionId}`).get()).data().status, "submitted", "failed eligibility check leaves appeal unresolved");
  await participantRef.update({ status: "active" });
  equal((await appealHandlers.PATCH(jsonRequest(admin.token, resolution), params)).status, 200, "authorized recent Admin can resolve a valid appeal");
  equal((await submissionRef.get()).data().status, "approved", "appeal approval persists the approved revision");
  const proposalId = `${testId}_proposal`;
  const settlementId = `challenge_settlement_${challengeId}_${proposalId}`;
  const endedAt = new Date(Date.now() - 60_000).toISOString();
  await challengeRef.update({ status: "under_review", numberOfWinners: 1, effectiveVotingStartsAt: new Date(Date.now() - 3_600_000).toISOString(), effectiveVotingEndsAt: endedAt, winnerAnnouncementAt: endedAt, approvedWinnerIds: [owner.uid], settlementId, winnersApprovedAt: endedAt });
  await db.collection("winnerProposals").doc(proposalId).set({ challengeId, status: "approved", settlementId, winners: [{ userId: owner.uid, submissionId, placement: 1, splitPercent: 100 }] });
  await db.collection("challengeSettlements").doc(settlementId).set({ challengeId, proposalId, status: "no_cash_allocation_required", externalPayoutExecuted: false });
  const announcement = await import("../app/api/admin/challenges/[id]/winner-proposals/[proposalId]/announce/route.ts");
  const announcementParams = { params: Promise.resolve({ id: challengeId, proposalId }) };
  const announcementBody = { confirmation: true, reason: "Verified final eligible winner and completed voting window." };
  await participantRef.update({ status: "disqualified" });
  equal((await announcement.POST(jsonRequest(admin.token, announcementBody, "POST"), announcementParams)).status, 409, "announcement rejects a newly disqualified allocated winner");
  equal((await db.collection("winners").where("challengeId", "==", challengeId).get()).size, 0, "failed announcement creates no official winner");
  await participantRef.update({ status: "active" });
  equal((await announcement.POST(jsonRequest(admin.token, announcementBody, "POST"), announcementParams)).status, 200, "verified eligible winner can be announced by recent Admin");
  equal((await announcement.POST(jsonRequest(admin.token, announcementBody, "POST"), announcementParams)).status, 200, "duplicate announcement is idempotent");
  equal((await db.collection("winners").where("challengeId", "==", challengeId).get()).size, 1, "official winner is recorded exactly once");
  const noWinnerId = `${testId}_no_winners`;
  await db.collection("challenges").doc(noWinnerId).set({ ...(await challengeRef.get()).data(), id: noWinnerId, creatorId: owner.uid, status: "completed", normalOutcome: "no_winners", outcomeReason: "no_valid_votes", approvedWinnerIds: [], settlementId: null, winnersApprovedAt: null, officialWinnerRecordIds: [], officialWinnerRecordCount: 0, officialWinnerRecordsValidatedAt: null, publishedAt: endedAt, settlementRestricted: true });
  const challengeHandler = await import("../app/api/challenges/[id]/route.ts");
  const noWinnerResponse = await challengeHandler.GET(new Request(`http://localhost/api/challenges/${noWinnerId}`), { params: Promise.resolve({ id: noWinnerId }) });
  equal(noWinnerResponse.status, 200, "signed-out visitors can read the completed public No Winners outcome");
  const noWinnerData = (await noWinnerResponse.json()).data;
  equal(noWinnerData.resultsUnavailable, false, "intentional No Winners is not described as unavailable results");
  equal((await db.collection("adminActionTasks").doc(`challenge_results_missing_${noWinnerId}`).get()).exists, false, "No Winners does not create a false missing-results incident");
  const paidId = `${testId}_expired_paid_entry`;
  const paidChallenge = { id: paidId, creatorId: "another_creator", builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, type: "Public Challenge", challengeType: "normal", visibility: "public", status: "registration_open", publishedAt: endedAt, title: "Expired checkout fixture", paidEntryEnabled: true, entryFeeAmountCents: 500, registrationOpensAt: endedAt, registrationDeadline: new Date(Date.now() + 3_600_000).toISOString(), startsAt: new Date(Date.now() + 3_600_000).toISOString(), submissionStartAt: new Date(Date.now() + 3_600_000).toISOString(), submissionDeadline: new Date(Date.now() + 7_200_000).toISOString(), votingStartsAt: new Date(Date.now() + 7_200_000).toISOString(), votingDeadline: new Date(Date.now() + 10_800_000).toISOString(), endsAt: new Date(Date.now() + 14_400_000).toISOString() };
  await db.collection("users").doc(owner.uid).update({ planId: "creator", planStatus: "active" });
  await db.collection("challenges").doc(paidId).set(paidChallenge);
  const payments = await import("../lib/server/monetization-payments.ts");
  const previousCheckout = await payments.createPendingEntryPayment(db, { userId: owner.uid, challengeId: paidId, challenge: paidChallenge });
  await db.collection("challengeEntryPayments").doc(previousCheckout.id).update({ reservationExpiresAt: new Date(Date.now() - 1).toISOString() });
  const entryHandler = await import("../app/api/challenges/[id]/entry-checkout/route.ts");
  const expiredCheckoutResponse = await entryHandler.POST(jsonRequest(owner.token, { entryAgreementAccepted: true }, "POST"), { params: Promise.resolve({ id: paidId }) });
  equal(expiredCheckoutResponse.status, 409, "expired original checkout remains fail-closed without another payment");
  const expiredCheckoutEnvelope = await expiredCheckoutResponse.json();
  equal(expiredCheckoutEnvelope.code, "ENTRY_RESERVATION_EXPIRED", "expired reservation is distinguished from other checkout rejection policies");
  const expiredCheckoutData = expiredCheckoutEnvelope.details;
  equal(expiredCheckoutData.reconciliationRequired, true, "participant receives an actionable reconciliation state");
  equal(expiredCheckoutData.supportUrl, "/support/new", "reconciliation action targets the existing Support creation route");
  equal((await db.collection("challengeEntryPayments").where("challengeId", "==", paidId).get()).size, 1, "expired checkout response does not create or overwrite a replacement payment");
  const withdrawalId = `${testId}_withdrawal`;
  const cashSourceId = `${testId}_reserved_cash`;
  await db.collection("cashWallets").doc(owner.uid).set({ userId: owner.uid, availableBalanceCents: 0, pendingBalanceCents: 0, underReviewBalanceCents: 5000 });
  await db.collection("cashLedger").doc(cashSourceId).set({ userId: owner.uid, direction: "credit", sourceType: "challenge_winner_prize", status: "withdrawal_reserved", amountCents: 5000, netAmountCents: 5000, availableAmountCents: 0, reservedAmountCents: 5000, disputeRestricted: false });
  await db.collection("withdrawalRequests").doc(withdrawalId).set({ userId: owner.uid, status: "pending_review", reservationVersion: 2, amountCents: 5000, currency: "USD", sourceIds: [cashSourceId], sourceAllocations: [{ sourceId: cashSourceId, amountCents: 5000 }], payoutExecuted: false });
  const adminOperations = await import("../app/api/admin/operations/route.ts");
  const rejectWithdrawal = { type: "withdrawal", id: withdrawalId, action: "reject", reason: "The customer requested cancellation of this reserved withdrawal." };
  const originalNow = Date.now;
  let staleAdminResponse;
  try {
    Date.now = () => originalNow() + 11 * 60_000;
    staleAdminResponse = await adminOperations.PATCH(jsonRequest(admin.token, { ...rejectWithdrawal, confirmed: true }));
  } finally { Date.now = originalNow; }
  equal(staleAdminResponse.status, 403, "stale Admin authentication cannot release a withdrawal reservation");
  ok((await staleAdminResponse.json()).message.includes("Recent authentication"), "rejection specifically enforces the step-up policy");
  equal((await adminOperations.PATCH(jsonRequest(admin.token, rejectWithdrawal))).status, 400, "financial rejection requires explicit confirmation");
  equal((await db.collection("cashWallets").doc(owner.uid).get()).data().underReviewBalanceCents, 5000, "unconfirmed rejection cannot release reserved funds");
  await db.collection("cashLedger").doc(cashSourceId).update({ disputeRestricted: true });
  equal((await adminOperations.PATCH(jsonRequest(admin.token, { ...rejectWithdrawal, confirmed: true }))).status, 409, "rejection cannot release disputed reserved funding");
  equal((await db.collection("cashWallets").doc(owner.uid).get()).data().underReviewBalanceCents, 5000, "disputed funds remain held for reconciliation");
  await db.collection("cashLedger").doc(cashSourceId).update({ disputeRestricted: false });
  equal((await adminOperations.PATCH(jsonRequest(admin.token, { ...rejectWithdrawal, confirmed: true }))).status, 200, "recent authorized Admin may reject an unrestricted reservation");
  equal((await db.collection("cashWallets").doc(owner.uid).get()).data().availableBalanceCents, 5000, "rejection releases only the original reserved amount");
  equal((await db.collection("withdrawalRequests").doc(withdrawalId).get()).data().status, "rejected", "rejection persists its authoritative outcome");
  equal((await db.collection("cashLedger").doc(cashSourceId).get()).data().netAmountCents, 5000, "rejection preserves the original earning commitment");
  equal((await adminOperations.PATCH(jsonRequest(admin.token, { ...rejectWithdrawal, confirmed: true }))).status, 409, "duplicate rejection cannot release balances twice");
  equal((await db.collection("cashWallets").doc(owner.uid).get()).data().availableBalanceCents, 5000, "duplicate rejection conserves the available balance");
  console.log(`PASS actual submission PATCH handler against Auth, Firestore, and Storage Emulators: ${assertionCount} assertions.`);
} finally {
  await app.delete();
}
