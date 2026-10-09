import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPrivateChallengeInvite } from "../lib/server/private-invites.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const auth = getAuth(app);
const { GET: privateGet, POST: privatePost } = await import("../app/api/private-exclusive/route.ts");
const { POST: joinChallenge } = await import("../app/api/challenges/[id]/join/route.ts");
const runId = `private_access_requests_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;

function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
async function createUser(label, { privateProfile = false, status = "active" } = {}) {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true }) });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await Promise.all([
    db.collection("users").doc(body.localId).set({ email, emailVerified: true, role: "creator", accountStatus: status }),
    db.collection("profiles").doc(body.localId).set({ email, displayName: label, username: label, usernameNormalized: label.toLowerCase(), profileVisibility: privateProfile ? "private" : "public" })
  ]);
  return { uid: body.localId, token: body.idToken, email };
}
function request(url, token, method = "GET", body) {
  return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function post(user, body) { return privatePost(request("http://localhost/api/private-exclusive", user?.token, "POST", body)); }
async function seedChallenge(id, owner, overrides = {}) {
  await db.collection("challenges").doc(id).set({ id, creatorId: owner.uid, visibility: "private", type: "Private / Exclusive", publicPreviewEnabled: true, privateAccessMethod: "invitation_code", status: "registration_open", lifecycleStatus: "registration_open", createdAt: new Date().toISOString(), startsAt: new Date(Date.now() - 60_000).toISOString(), registrationDeadline: new Date(Date.now() + 86_400_000).toISOString(), submissionDeadline: new Date(Date.now() + 86_400_000).toISOString(), votingDeadline: new Date(Date.now() + 172_800_000).toISOString(), maxParticipants: 20, participantCount: 0, title: `Private ${id}`, ...overrides });
}

try {
  const owner = await createUser("owner");
  const requester = await createUser("requester");
  const unrelated = await createUser("unrelated");
  const privateRequester = await createUser("private_requester", { privateProfile: true });
  const challengeId = `${runId}_approval`;
  await seedChallenge(challengeId, owner, { privateParticipantRequirements: ["Follow the challenge rules"], privateParticipantAcknowledgements: ["I agree to the rules"], privateParticipantQuestions: ["What will you submit?"] });

  const incompleteRequirements = await post(requester, { action: "request_access", challengeId, reason: "I want to participate." });
  if (incompleteRequirements.status !== 422) console.error("Incomplete requirement response:", await incompleteRequirements.clone().text());
  equal(incompleteRequirements.status, 422, "required acknowledgements and answers are enforced before a request can be created");
  const requestBody = { action: "request_access", challengeId, reason: "I want to participate.", note: "I can meet the schedule.", requirementAcknowledgements: ["requirement-0", "acknowledgement-0"], participantAnswers: { "question-0": "A short film." } };
  const first = await post(requester, requestBody);
  equal(first.status, 200, "eligible requester can submit access request");
  const firstData = (await first.json()).data;
  equal(firstData.status, "pending_review", "new request is pending");
  const duplicate = await post(requester, requestBody);
  equal(duplicate.status, 200, "duplicate request is safe");
  equal((await duplicate.json()).data.duplicate, true, "duplicate request reuses the deterministic request record");
  equal((await db.collection("privateAccessRequests").where("challengeId", "==", challengeId).get()).size, 1, "duplicate request leaves one Firestore request");
  equal((await post(null, requestBody)).status, 401, "unauthenticated request is rejected");
  equal((await privateGet(request(`http://localhost/api/private-exclusive?challengeId=${challengeId}`, unrelated.token))).status, 404, "unrelated creator cannot inspect requests");
  const ownerQueue = await privateGet(request(`http://localhost/api/private-exclusive?challengeId=${challengeId}`, owner.token));
  equal(ownerQueue.status, 200, "owner can load request queue");
  const ownerQueueData = (await ownerQueue.json()).data;
  equal(ownerQueueData.accessRequests.length, 1, "owner receives pending request");
  equal(ownerQueueData.accessRequests[0].displayName, "requester", "owner receives public requester display identity");
  equal((await post(requester, { action: "decide_access_request", challengeId, requestId: firstData.requestId, decision: "approve" })).status, 404, "requester cannot approve own request");

  const decisionUrl = "http://localhost/api/private-exclusive";
  const decisions = await Promise.all([
    privatePost(request(decisionUrl, owner.token, "POST", { action: "decide_access_request", challengeId, requestId: firstData.requestId, decision: "approve" })),
    privatePost(request(decisionUrl, owner.token, "POST", { action: "decide_access_request", challengeId, requestId: firstData.requestId, decision: "reject" }))
  ]);
  const decisionStatuses = decisions.map((response) => response.status).sort();
  check(decisionStatuses.includes(200) && decisionStatuses.includes(409), "concurrent conflicting decisions serialize to one winner");
  const storedRequest = (await db.collection("privateAccessRequests").doc(firstData.requestId).get()).data();
  check(["approved", "rejected"].includes(storedRequest.status), "request ends in exactly one decided state");
  equal(storedRequest.decidedBy, owner.uid, "decision records the authorized owner");
  const accessRef = db.collection("privateChallengeAccess").doc(`${challengeId}_${requester.uid}`);
  const grant = await accessRef.get();
  if (storedRequest.status === "approved") {
    equal(grant.data()?.source, "owner_approval", "approval creates durable owner-review grant");
    equal((await db.collection("challengeParticipants").doc(`${challengeId}_${requester.uid}`).get()).exists, false, "approval does not register the user as a participant");
    const retry = await post(owner, { action: "decide_access_request", challengeId, requestId: firstData.requestId, decision: "approve" });
    equal(retry.status, 200, "same decision retry is idempotent");
    equal((await db.collection("privateChallengeAccess").where("requestId", "==", firstData.requestId).get()).size, 1, "duplicate approval leaves one access grant");
    const fullChallenge = `${runId}_full`;
    await seedChallenge(fullChallenge, owner, { maxParticipants: 1, participantCount: 1 });
    await db.collection("privateChallengeAccess").doc(`${fullChallenge}_${requester.uid}`).set({ id: `${fullChallenge}_${requester.uid}`, challengeId: fullChallenge, userId: requester.uid, status: "approved", source: "owner_approval" });
    equal((await joinChallenge(request("http://localhost", requester.token, "POST", { entryAgreementAccepted: true }), { params: Promise.resolve({ id: fullChallenge }) })).status, 409, "access approval does not bypass challenge capacity");
    const paidChallenge = `${runId}_paid`;
    await seedChallenge(paidChallenge, owner, { paidEntryEnabled: true, entryFeeRequired: true, entryFeeCents: 500, paidEntry: { required: true, amountCents: 500, currency: "usd" } });
    await db.collection("privateChallengeAccess").doc(`${paidChallenge}_${requester.uid}`).set({ id: `${paidChallenge}_${requester.uid}`, challengeId: paidChallenge, userId: requester.uid, status: "approved", source: "owner_approval" });
    equal((await joinChallenge(request("http://localhost", requester.token, "POST", { entryAgreementAccepted: true }), { params: Promise.resolve({ id: paidChallenge }) })).status, 402, "access approval does not bypass paid-entry checkout");
  } else {
    equal(grant.exists, false, "rejection creates no access grant");
    equal((await post(requester, requestBody)).status, 409, "rejected request cannot be resubmitted into approval");
  }
  const privateIdentityRequest = await post(privateRequester, { ...requestBody, challengeId, reason: "I would like to join." });
  equal(privateIdentityRequest.status, 200, "a different user can request access independently");
  const privateQueue = await privateGet(request(`http://localhost/api/private-exclusive?challengeId=${challengeId}`, owner.token));
  const privateRequestRecord = (await privateQueue.json()).data.accessRequests.find((item) => item.userId === privateRequester.uid);
  equal(privateRequestRecord.displayName, "Private profile", "owner queue does not disclose a private requester's profile identity");
  equal(privateRequestRecord.email, undefined, "owner queue never returns a private requester's email");
  const previewList = await privateGet(request("http://localhost/api/private-exclusive?limit=30", requester.token));
  equal(previewList.status, 200, "requester can inspect public-preview private opportunities");
  const preview = (await previewList.json()).data.challenges.find((item) => item.id === challengeId);
  check(Boolean(preview), "locked challenge appears as a preview opportunity");

  for (const method of ["invite_link", "invitation_code", "direct_invitations"]) {
    const inviteUser = await createUser(`invite_${method}`);
    const inviteChallengeId = `${runId}_${method}`;
    await seedChallenge(inviteChallengeId, owner, { privateAccessMethod: method });
    const credentials = await createPrivateChallengeInvite(db, { challengeId: inviteChallengeId, creatorId: owner.uid, now: new Date().toISOString(), method, allowedEmails: method === "direct_invitations" ? [inviteUser.email] : [] });
    const credential = method === "invite_link" ? credentials.token : method === "invitation_code" ? credentials.code : credentials.invitations[0].token;
    const admitted = await post(inviteUser, { action: "admit_invite", credential, requirementAcknowledgements: [], participantAnswers: {} });
    equal(admitted.status, 200, `${method} remains a functional admission method`);
    equal((await db.collection("privateChallengeAccess").doc(`${inviteChallengeId}_${inviteUser.uid}`).get()).data()?.source, method, `${method} grant retains the selected method`);
  }

  console.log(`PASS actual Private access request, owner decision, access grant, join, and invitation handlers against Firebase Auth/Firestore Emulator: ${assertions} assertions.`);
} finally {
  await db.terminate();
  await app.delete();
}
