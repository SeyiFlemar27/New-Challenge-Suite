import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setStripeClientForTests } from "../lib/stripe.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
process.env.STRIPE_SECRET_KEY ??= "sk_test_sponsor_agreement";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_deterministic_sponsor_agreement";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);
const runId = `sponsor_agreement_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
let eventToReturn = null;
let checkoutCallCount = 0;
let createdSession = null;

function check(condition, message) { assert.ok(condition, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
async function createUser(label, accountStatus = "active") {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ emailVerified: true, accountStatus, role: "creator" });
  return { uid: body.localId, token: body.idToken };
}
function request(url, token, method = "GET", body) {
  return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function postInterest(challengeId, sponsor, amountCents = 5000) {
  const { POST } = await import("../app/api/sponsor/challenges/[id]/interest/route.ts");
  return POST(request(`http://localhost/api/sponsor/challenges/${challengeId}/interest`, sponsor.token, "POST", {
    amountCents, placements: ["challenge_detail", "winner_announcement"], ctaText: "Explore brand", ctaUrl: "https://brand.example.test", deliverables: ["Sponsor logo placement"]
  }), { params: Promise.resolve({ id: challengeId }) });
}
async function hostDecision(challengeId, agreementId, host, action) {
  const { PATCH } = await import("../app/api/challenges/[id]/sponsorship-interests/route.ts");
  return PATCH(request(`http://localhost/api/challenges/${challengeId}/sponsorship-interests`, host.token, "PATCH", { agreementId, action }), { params: Promise.resolve({ id: challengeId }) });
}
async function sponsorFunding(challengeId, agreementId, sponsor, idempotencyKey) {
  const { POST } = await import("../app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
  return POST(request(`http://localhost/api/sponsor/challenges/${challengeId}/funding-checkout`, sponsor.token, "POST", { agreementId, idempotencyKey }), { params: Promise.resolve({ id: challengeId }) });
}

try {
  const host = await createUser("host");
  const sponsor = await createUser("sponsor");
  const viewer = await createUser("viewer");
  const revoked = await createUser("revoked");
  const expiredMember = await createUser("expired_member");
  const otherSponsor = await createUser("other_sponsor");
  const reviewAdmin = await createUser("review_admin");
  await db.collection("users").doc(reviewAdmin.uid).set({ adminRoles: ["sponsor_manager"], adminAccessStatus: "active", adminSecuritySetupComplete: true }, { merge: true });
  const sponsorOrgId = `${runId}_org`;
  const otherOrgId = `${runId}_other_org`;
  await Promise.all([
    db.collection("sponsorOrganizations").doc(sponsorOrgId).set({ id: sponsorOrgId, name: "Sponsor A", status: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorOrganizations").doc(otherOrgId).set({ id: otherOrgId, name: "Sponsor B", status: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorProfiles").doc(sponsorOrgId).set({ sponsorOrganizationId: sponsorOrgId, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true, logoPath: null }),
    db.collection("sponsorProfiles").doc(otherOrgId).set({ sponsorOrganizationId: otherOrgId, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorMemberships").doc(`${sponsorOrgId}_${sponsor.uid}`).set({ sponsorOrganizationId: sponsorOrgId, userId: sponsor.uid, role: "owner", status: "active" }),
    db.collection("sponsorMemberships").doc(`${sponsorOrgId}_${viewer.uid}`).set({ sponsorOrganizationId: sponsorOrgId, userId: viewer.uid, role: "viewer", status: "active" }),
    db.collection("sponsorMemberships").doc(`${sponsorOrgId}_${revoked.uid}`).set({ sponsorOrganizationId: sponsorOrgId, userId: revoked.uid, role: "owner", status: "revoked" }),
    db.collection("sponsorMemberships").doc(`${sponsorOrgId}_${expiredMember.uid}`).set({ sponsorOrganizationId: sponsorOrgId, userId: expiredMember.uid, role: "owner", status: "expired", expiresAt: new Date(Date.now() - 60000).toISOString() }),
    db.collection("sponsorMemberships").doc(`${otherOrgId}_${otherSponsor.uid}`).set({ sponsorOrganizationId: otherOrgId, userId: otherSponsor.uid, role: "owner", status: "active" })
  ]);
  const challengeId = `${runId}_challenge`;
  await db.collection("challenges").doc(challengeId).set({ id: challengeId, title: "Eligible sponsor opportunity", creatorId: host.uid, status: "active", visibility: "public", sponsorEnabled: true, publishedAt: new Date().toISOString() });

  const { GET: loadOpportunity } = await import("../app/api/sponsor/discover/challenges/[challengeId]/route.ts");
  const opportunityResponse = await loadOpportunity(request(`http://localhost/api/sponsor/discover/challenges/${challengeId}`, sponsor.token), { params: Promise.resolve({ challengeId }) });
  equal(opportunityResponse.status, 200, "active Sponsor can view an available opportunity");
  equal((await opportunityResponse.json()).data.opportunity.agreement, null, "a new opportunity has no invented agreement");
  const unauthenticatedInterest = await postInterest(challengeId, { token: "" });
  equal(unauthenticatedInterest.status, 401, "unauthenticated Sponsor interest is denied");
  const unauthorizedMemberInterest = await postInterest(challengeId, viewer);
  equal(unauthorizedMemberInterest.status, 403, "Sponsor viewer without sponsorship.manage cannot express interest");
  equal((await postInterest(challengeId, revoked)).status, 403, "revoked Sponsor member cannot express interest");
  equal((await postInterest(challengeId, expiredMember)).status, 403, "expired Sponsor member cannot express interest");

  const earlyCheckout = await sponsorFunding(challengeId, `${runId}_forged`, sponsor, `${runId}_early_funding`);
  equal(earlyCheckout.status, 409, "funding without an accepted agreement is rejected");
  const interestResponse = await postInterest(challengeId, sponsor, 5000);
  equal(interestResponse.status, 200, "authorized Sponsor submits interest and proposed terms");
  const interestBody = await interestResponse.json();
  const agreementId = interestBody.data.agreement.id;
  equal(interestBody.data.agreement.sponsorOrganizationId, sponsorOrgId, "interest is bound to the authenticated Sponsor organization");
  equal(interestBody.data.agreement.terms.amountCents, 5000, "proposed amount is persisted as terms, not charged");
  const duplicateInterest = await postInterest(challengeId, sponsor, 9000);
  equal(duplicateInterest.status, 200, "duplicate interest request is idempotent");
  equal((await duplicateInterest.json()).data.agreement.terms.amountCents, 5000, "duplicate interest cannot unilaterally replace proposed terms");
  const wrongOrgAccept = await (await import("../app/api/sponsor/agreements/[agreementId]/accept/route.ts")).POST(request("http://localhost/accept", otherSponsor.token, "POST", {}), { params: Promise.resolve({ agreementId }) });
  equal(wrongOrgAccept.status, 403, "another Sponsor organization cannot accept the agreement");
  const sponsorBeforeCreator = await (await import("../app/api/sponsor/agreements/[agreementId]/accept/route.ts")).POST(request("http://localhost/accept", sponsor.token, "POST", {}), { params: Promise.resolve({ agreementId }) });
  equal(sponsorBeforeCreator.status, 409, "Sponsor cannot self-approve before creator acceptance");

  const { GET: listInterests } = await import("../app/api/challenges/[id]/sponsorship-interests/route.ts");
  const manageResponse = await listInterests(request(`http://localhost/api/challenges/${challengeId}/sponsorship-interests`, host.token), { params: Promise.resolve({ id: challengeId }) });
  equal(manageResponse.status, 200, "challenge owner can view sponsorship interests");
  check((await manageResponse.json()).data.interests.some((item) => item.id === agreementId), "challenge owner sees submitted interest");
  const unrelatedHost = await createUser("unrelated_host");
  const unrelatedDecision = await hostDecision(challengeId, agreementId, unrelatedHost, "accept");
  equal(unrelatedDecision.status, 403, "unrelated creator cannot accept sponsorship terms");
  const creatorAccepted = await hostDecision(challengeId, agreementId, host, "accept");
  equal(creatorAccepted.status, 200, "challenge owner accepts proposed terms");
  equal((await db.collection("sponsorChallengeAgreements").doc(agreementId).get()).data().status, "awaiting_sponsor_acceptance", "one-party acceptance does not activate agreement");
  const sponsorAccepted = await (await import("../app/api/sponsor/agreements/[agreementId]/accept/route.ts")).POST(request("http://localhost/accept", sponsor.token, "POST", {}), { params: Promise.resolve({ agreementId }) });
  equal(sponsorAccepted.status, 200, "Sponsor accepts the exact creator-approved version");
  equal((await db.collection("sponsorChallengeAgreements").doc(agreementId).get()).data().status, "accepted", "agreement activates only after both parties accept");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  stripe.checkout.sessions.create = async (params) => {
    checkoutCallCount += 1;
    createdSession = { id: `cs_${runId}_${checkoutCallCount}`, mode: "payment", status: "open", payment_status: "unpaid", amount_total: params.line_items[0].price_data.unit_amount, currency: "usd", metadata: params.metadata, payment_intent: `pi_${runId}_${checkoutCallCount}` };
    return { ...createdSession, url: "https://checkout.example.test/session" };
  };
  stripe.webhooks.constructEvent = () => eventToReturn;
  setStripeClientForTests(stripe);
  const fundingAttempts = await Promise.all([
    sponsorFunding(challengeId, agreementId, sponsor, `${runId}_fund_a`),
    sponsorFunding(challengeId, agreementId, sponsor, `${runId}_fund_b`)
  ]);
  const fundingStatuses = await Promise.all(fundingAttempts.map((response) => response.status));
  equal(fundingStatuses.filter((status) => status === 200).length, 1, "only one concurrent funding request reserves the agreement");
  equal(fundingStatuses.filter((status) => status === 409).length, 1, "second concurrent funding request is rejected");
  equal(checkoutCallCount, 1, "one Stripe checkout is created for the agreement");
  const contributionSnap = await db.collection("sponsorContributions").where("agreementId", "==", agreementId).get();
  equal(contributionSnap.size, 1, "one pending contribution record exists");
  const contribution = contributionSnap.docs[0].data();
  equal(contribution.amountCents, 5000, "checkout amount comes from accepted terms, ignoring client amount attempts");
  equal(contribution.status, "pending", "checkout is not confirmed before provider webhook");
  equal((await db.collection("sponsorChallengeAgreements").doc(agreementId).get()).data().fundingStatus, "pending", "agreement records pending funding distinctly");

  const { POST: webhook } = await import("../app/api/stripe/webhook/route.ts");
  eventToReturn = { id: `evt_${runId}_complete`, type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), data: { object: { ...createdSession, status: "complete", payment_status: "paid" } } };
  const webhookResponse = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "deterministic" }, body: "{}" }));
  equal(webhookResponse.status, 200, "actual Stripe webhook handler confirms provider-paid funding");
  const duplicateEvent = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "deterministic" }, body: "{}" }));
  equal(duplicateEvent.status, 200, "duplicate webhook event is acknowledged idempotently");
  eventToReturn = { ...eventToReturn, id: `evt_${runId}_retry` };
  const distinctRetry = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "deterministic" }, body: "{}" }));
  equal(distinctRetry.status, 200, "new event ID for the same paid session remains idempotent");
  equal((await db.collection("sponsorContributions").doc(contribution.id).get()).data().status, "confirmed", "provider confirmation changes contribution to confirmed");
  const confirmedAgreement = (await db.collection("sponsorChallengeAgreements").doc(agreementId).get()).data();
  equal(confirmedAgreement.fundingStatus, "confirmed", "webhook moves agreement from pending to confirmed funding");
  equal(confirmedAgreement.status, "funded_pending_review", "confirmed payment awaits placement review");
  const linkedSponsorships = await db.collection("sponsorships").where("agreementId", "==", agreementId).get();
  equal(linkedSponsorships.size, 1, "one sponsorship activation record is linked to the funded agreement");
  const sponsorship = linkedSponsorships.docs[0].data();
  equal(sponsorship.sponsorOrganizationId, sponsorOrgId, "activation record retains Sponsor organization ownership");
  equal(sponsorship.challengeId, challengeId, "activation record is attached to the accepted challenge");
  equal(sponsorship.status, "pending_admin_review", "confirmed funding awaits Admin placement review");
  equal(sponsorship.placementStatus, "pending_review", "funding does not auto-approve public placements");
  equal((await db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", contribution.id).get()).size, 1, "one prize-directed ledger entry is recorded");
  equal((await sponsorFunding(challengeId, agreementId, otherSponsor, `${runId}_wrong_org`)).status, 403, "a different Sponsor organization cannot fund the agreement");
  const { GET: listCampaignReviews, PATCH: decideCampaignReview } = await import("../app/api/admin/sponsor-campaigns/route.ts");
  equal((await listCampaignReviews(request("http://localhost/api/admin/sponsor-campaigns", sponsor.token))).status, 403, "Sponsor cannot access the Admin placement review queue");
  const reviewQueue = await listCampaignReviews(request("http://localhost/api/admin/sponsor-campaigns", reviewAdmin.token));
  equal(reviewQueue.status, 200, "authorized Admin can review funded placements");
  check((await reviewQueue.json()).data.campaigns.some((item) => item.id === `sponsorship_agreement_${agreementId}`), "actual Admin queue returns the funded agreement-linked campaign");
  const sponsorshipId = `sponsorship_agreement_${agreementId}`;
  const reviewRequest = () => request("http://localhost/api/admin/sponsor-campaigns", reviewAdmin.token, "PATCH", { id: sponsorshipId, action: "approve_placement", reason: "Placement matches accepted terms and brand safety requirements." });
  equal((await decideCampaignReview(reviewRequest())).status, 200, "Admin approves placement through the actual review handler");
  equal((await db.collection("sponsorships").doc(sponsorshipId).get()).data().status, "approved", "approved campaign becomes eligible for visibility");
  equal((await db.collection("sponsorships").doc(sponsorshipId).get()).data().placementStatus, "approved", "placement approval is persisted separately from funding");
  equal((await db.collection("sponsorChallengeAgreements").doc(agreementId).get()).data().status, "active", "agreement activates only after funded placement review");
  equal((await decideCampaignReview(reviewRequest())).status, 200, "duplicate Admin placement decision is idempotent");
  equal((await db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", contribution.id).get()).size, 1, "placement approval does not create a second financial ledger mutation");

  const raceChallengeId = `${runId}_decision_race`;
  await db.collection("challenges").doc(raceChallengeId).set({ id: raceChallengeId, title: "Decision race", creatorId: host.uid, status: "active", visibility: "public", sponsorEnabled: true, publishedAt: new Date().toISOString() });
  const raceInterest = await postInterest(raceChallengeId, sponsor, 3000);
  const raceAgreementId = (await raceInterest.json()).data.agreement.id;
  const decisions = await Promise.all([hostDecision(raceChallengeId, raceAgreementId, host, "accept"), hostDecision(raceChallengeId, raceAgreementId, host, "reject")]);
  const decisionStatuses = decisions.map((result) => result.status);
  equal(decisionStatuses.filter((status) => status === 200).length, 1, "concurrent creator accept/reject has one winning transition");
  equal(decisionStatuses.filter((status) => status === 409).length, 1, "conflicting creator decision loses transactionally");
  check(["awaiting_sponsor_acceptance", "rejected"].includes(String((await db.collection("sponsorChallengeAgreements").doc(raceAgreementId).get()).data()?.status)), "decision race leaves one authoritative current state");

  const cancelledChallengeId = `${runId}_cancelled_challenge`;
  await db.collection("challenges").doc(cancelledChallengeId).set({ id: cancelledChallengeId, title: "Cancelled checkout", creatorId: host.uid, status: "active", visibility: "public", sponsorEnabled: true, publishedAt: new Date().toISOString() });
  const cancelledInterest = await postInterest(cancelledChallengeId, sponsor, 2000);
  const cancelledAgreementId = (await cancelledInterest.json()).data.agreement.id;
  equal((await hostDecision(cancelledChallengeId, cancelledAgreementId, host, "accept")).status, 200, "creator accepts the cancellation test terms");
  equal((await (await import("../app/api/sponsor/agreements/[agreementId]/accept/route.ts")).POST(request("http://localhost/accept", sponsor.token, "POST", {}), { params: Promise.resolve({ agreementId: cancelledAgreementId }) })).status, 200, "Sponsor accepts cancellation test terms");
  equal((await sponsorFunding(cancelledChallengeId, cancelledAgreementId, sponsor, `${runId}_cancel_checkout`)).status, 200, "accepted terms create a pending checkout before cancellation");
  const cancelledContributionSnap = await db.collection("sponsorContributions").where("agreementId", "==", cancelledAgreementId).get();
  equal(cancelledContributionSnap.size, 1, "cancelled checkout has a persisted source contribution");
  eventToReturn = { id: `evt_${runId}_expired`, type: "checkout.session.expired", created: Math.floor(Date.now() / 1000), data: { object: { ...createdSession, status: "expired", payment_status: "unpaid" } } };
  equal((await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "deterministic" }, body: "{}" }))).status, 200, "expired checkout is processed by the actual webhook route");
  equal((await db.collection("sponsorContributions").doc(cancelledContributionSnap.docs[0].id).get()).data().status, "expired", "expired payment releases pending contribution state");
  const cancelledAgreement = (await db.collection("sponsorChallengeAgreements").doc(cancelledAgreementId).get()).data();
  equal(cancelledAgreement.status, "accepted", "expired checkout returns the agreement to fundable state");
  equal(cancelledAgreement.fundingStatus, "expired", "expired checkout is not represented as confirmed funding");
  const checkoutCountAfterExpiry = checkoutCallCount;
  equal((await sponsorFunding(cancelledChallengeId, cancelledAgreementId, sponsor, `${runId}_cancel_checkout`)).status, 409, "an expired checkout idempotency key cannot create a new payment attempt without a new key");
  equal(checkoutCallCount, checkoutCountAfterExpiry, "retrying an expired key does not call Stripe or create an unreserved checkout");

  const rejectedChallengeId = `${runId}_rejected_challenge`;
  await db.collection("challenges").doc(rejectedChallengeId).set({ id: rejectedChallengeId, title: "Rejected opportunity", creatorId: host.uid, status: "active", visibility: "public", sponsorEnabled: true, publishedAt: new Date().toISOString() });
  const rejectedInterest = await postInterest(rejectedChallengeId, sponsor, 2500);
  const rejectedAgreementId = (await rejectedInterest.json()).data.agreement.id;
  equal((await hostDecision(rejectedChallengeId, rejectedAgreementId, host, "reject")).status, 200, "creator can reject interest");
  equal((await sponsorFunding(rejectedChallengeId, rejectedAgreementId, sponsor, `${runId}_rejected_fund`)).status, 409, "rejected interest cannot be funded");
  const immutable = await (await import("../app/api/sponsor/challenges/[id]/interest/route.ts")).POST(request("http://localhost/interest", otherSponsor.token, "POST", { amountCents: 9000, placements: ["challenge_detail"], ctaText: "x", ctaUrl: "https://brand.example.test", deliverables: [] }), { params: Promise.resolve({ id: challengeId }) });
  equal(immutable.status, 200, "another Sponsor organization can submit a separate opportunity interest");
  const after = await db.collection("sponsorChallengeAgreements").doc(agreementId).get();
  equal(after.data().terms.amountCents, 5000, "accepted terms remain immutable after another Sponsor submission");

  setStripeClientForTests(null);
  console.log(`PASS actual Sponsor agreement, checkout, webhook, and Admin activation handlers against Firebase Auth/Firestore Emulator: ${assertions} assertions; interest, dual acceptance, conflicting decisions, concurrent funding, Stripe idempotency, placement approval, rejection, and ownership verified.`);
} finally {
  setStripeClientForTests(null);
  await Promise.all([
    db.collection("sponsorChallengeAgreements").where("challengeId", "==", `${runId}_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("sponsorChallengeAgreements").where("challengeId", "==", `${runId}_rejected_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("challenges").doc(`${runId}_challenge`).delete(),
    db.collection("challenges").doc(`${runId}_rejected_challenge`).delete(),
    db.collection("challenges").doc(`${runId}_decision_race`).delete(),
    db.collection("challenges").doc(`${runId}_cancelled_challenge`).delete(),
    db.collection("sponsorChallengeAgreements").where("challengeId", "==", `${runId}_decision_race`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("sponsorChallengeAgreements").where("challengeId", "==", `${runId}_cancelled_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("sponsorMemberships").where("sponsorOrganizationId", "in", [`${runId}_org`, `${runId}_other_org`]).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("sponsorOrganizations").doc(`${runId}_org`).delete(),
    db.collection("sponsorOrganizations").doc(`${runId}_other_org`).delete(),
    db.collection("sponsorProfiles").doc(`${runId}_org`).delete(),
    db.collection("sponsorProfiles").doc(`${runId}_other_org`).delete(),
    db.collection("sponsorContributions").where("challengeId", "==", `${runId}_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("sponsorships").where("challengeId", "==", `${runId}_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete()))),
    db.collection("challengeFinancialLedger").where("challengeId", "==", `${runId}_challenge`).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete())))
  ]);
  void auth;
}
