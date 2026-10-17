import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setStripeClientForTests } from "../lib/stripe.ts";
import { recordStripeSponsorDispute } from "../lib/server/stripe-sponsor-disputes.ts";
import { getTournamentFundingSources } from "../lib/server/tournament-funding-sources.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) assert.match(process.env[key] ?? "", /^127\.0\.0\.1:\d+$/);
process.env.STRIPE_SECRET_KEY = "sk_test_isolated_tournament_fixture";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_isolated_tournament_fixture";
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app), prefix = `tour_sponsor_${randomUUID().replaceAll("-", "")}`;
let assertions = 0, calls = 0;
const equal = (actual, expected, reason) => { assert.equal(actual, expected, reason); assertions++; };
const sessions = new Map(), byKey = new Map();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
stripe.checkout.sessions.create = async (params, options) => {
  if (byKey.has(options.idempotencyKey)) return byKey.get(options.idempotencyKey);
  equal(params.payment_method_types.join(","), "card", "card only");
  equal(params.payment_intent_data.capture_method, "automatic", "automatic capture");
  calls++;
  const session = { id: `cs_${prefix}_${calls}`, object: "checkout.session", mode: "payment", status: "open", payment_status: "unpaid", amount_total: params.line_items[0].price_data.unit_amount, currency: "usd", metadata: params.metadata, payment_method_types: ["card"], payment_intent: `pi_${prefix}_${calls}`, url: "https://checkout.stripe.invalid/isolated-fixture", expires_at: params.expires_at };
  byKey.set(options.idempotencyKey, session); sessions.set(session.id, session); return session;
};
stripe.checkout.sessions.retrieve = async id => sessions.get(id);
stripe.paymentIntents.retrieve = async id => {
  const session = [...sessions.values()].find(row => row.payment_intent === id);
  return { id, object: "payment_intent", status: "succeeded", capture_method: "automatic", amount_received: session.amount_total, amount: session.amount_total, currency: "usd", latest_charge: { id: `ch_${id}`, object: "charge", status: "succeeded", paid: true, captured: true, disputed: false, refunded: false, review: null, outcome: { type: "authorized" }, fraud_details: {}, payment_intent: id, amount: session.amount_total, amount_captured: session.amount_total, currency: "usd", payment_method_details: { type: "card" }, created: Math.floor(Date.parse("2026-10-10T12:00:00Z") / 1000) } };
};
setStripeClientForTests(stripe);
function request(url, token, method = "GET", body) {
  return new Request(`http://localhost${url}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function user(label) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${prefix}_${label}@accounts.invalid`, password: "IsolatedTest123!", returnSecureToken: true }) });
  const body = await response.json(); assert(response.ok);
  await db.collection("users").doc(body.localId).set({ emailVerified: true, accountStatus: "active", role: "creator" });
  return { uid: body.localId, token: body.idToken };
}
const { POST: interest } = await import("../app/api/sponsor/challenges/[id]/interest/route.ts");
const { PATCH: decide, GET: list } = await import("../app/api/tournaments/[id]/sponsorship-interests/route.ts");
const { POST: accept } = await import("../app/api/sponsor/agreements/[agreementId]/accept/route.ts");
const { POST: checkout } = await import("../app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
const { POST: webhook } = await import("../app/api/stripe/webhook/route.ts");
const { GET: discover } = await import("../app/api/sponsor/discover/challenges/route.ts");
const { GET: opportunity } = await import("../app/api/sponsor/discover/challenges/[challengeId]/route.ts");
async function deliver(session, eventCreated, eventId = `evt_${randomUUID()}`) {
  session.status = "complete"; session.payment_status = "paid";
  const payload = JSON.stringify({ id: eventId, object: "event", type: "checkout.session.completed", created: eventCreated, data: { object: session } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: payload }));
}
try {
  const host = await user("host"), sponsor = await user("sponsor"), unrelated = await user("unrelated");
  const org = `${prefix}_organization`;
  await db.collection("sponsorOrganizations").doc(org).set({ id: org, name: "Isolated Sponsor", status: "active", sponsorOnboardingComplete: true });
  await db.collection("sponsorProfiles").doc(org).set({ sponsorOrganizationId: org, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true });
  await db.collection("sponsorMemberships").doc(`${org}_${sponsor.uid}`).set({ sponsorOrganizationId: org, userId: sponsor.uid, role: "owner", status: "active" });
  async function prepared(label) {
    const id = `${prefix}_${label}`, params = { params: Promise.resolve({ id }) };
    await db.collection("tournaments").doc(id).set({ id, hostId: host.uid, title: "Studio Tournament", category: "Art", privacy: "public", status: "registration_open", configVersion: 3, sponsorship: { sponsorReady: true }, sponsorFundingActivationEnabled: true });
    const response = await interest(request(`/interest?subjectType=tournament`, sponsor.token, "POST", { amountCents: 5000, placements: ["challenge_detail"], ctaText: "Brand", ctaUrl: "https://brand.invalid", deliverables: ["Approved logo placement"] }), params);
    equal(response.status, 200, "authorized Tournament interest");
    const agreement = (await response.json()).data.agreement;
    equal(agreement.subjectType, "tournament", "subject discriminator");
    equal((await decide(request("/decision", unrelated.token, "PATCH", { agreementId: agreement.id, action: "accept", reason: "Reviewed terms", confirmed: true }), params)).status, 403, "unrelated organizer denied");
    equal((await decide(request("/decision", host.token, "PATCH", { agreementId: agreement.id, action: "accept" }), params)).status, 422, "reason/confirmation mandatory");
    equal((await decide(request("/decision", host.token, "PATCH", { agreementId: agreement.id, action: "accept", reason: "Reviewed published brand terms", confirmed: true }), params)).status, 200, "organizer accepts exact terms");
    equal((await accept(request("/accept", sponsor.token, "POST", {}), { params: Promise.resolve({ agreementId: agreement.id }) })).status, 200, "approved Sponsor accepts version");
    const key = `${prefix}_${label}_checkout`;
    const funding = await checkout(request("/checkout?subjectType=tournament", sponsor.token, "POST", { agreementId: agreement.id, idempotencyKey: key }), params);
    equal(funding.status, 200, "actual checkout handler uses accepted terms");
    const recordId = (await funding.json()).data.sponsorContributionId;
    const record = (await db.collection("sponsorContributions").doc(recordId).get()).data();
    equal(record.status, "pending", "checkout does not confirm funds");
    const retry = await checkout(request("/checkout?subjectType=tournament", sponsor.token, "POST", { agreementId: agreement.id, idempotencyKey: key }), params);
    equal(retry.status, 200, "checkout retry");
    return { id, params, agreement, recordId, record, session: sessions.get(record.stripeCheckoutSessionId) };
  }
  // Provider fixtures use fixed past reservation and transition times; event receipt is now.
  async function window(row, completionSeconds, cutoff = "2026-10-10T12:02:00.000Z") {
    await db.collection("sponsorContributions").doc(row.recordId).update({ createdAt: "2026-10-10T12:00:00.000Z", reservationCreatedAt: "2026-10-10T12:00:00.000Z", reservationExpiresAt: "2026-10-10T12:15:00.000Z" });
    await db.collection("tournaments").doc(row.id).update({ firstVotingOpenedAt: cutoff, tournamentVotingCutoffAt: cutoff });
    await db.collection("tournamentMatches").doc(`${row.id}_first`).set({ tournamentId: row.id, status: "voting_open", votingOpenedAt: cutoff });
    await db.collection("tournamentFundingCutoffs").doc(row.id).set({ tournamentId: row.id, firstVotingOpenedAt: cutoff, sourceMatchId: `${row.id}_first` });
    await db.collection("tournamentAuditEvents").doc(`${row.id}_first_voting_opened`).set({ tournamentId: row.id, action: "match_voting_opened", metadata: { votingOpenedAt: cutoff } });
    return deliver(row.session, Math.floor(Date.parse(`2026-10-10T12:${completionSeconds}.000Z`) / 1000));
  }
  const timely = await prepared("timely");
  equal((await window(timely, "01:58")).status, 200, "late delivery of verifiable pre-cutoff confirmation");
  equal((await db.collection("sponsorContributions").doc(timely.recordId).get()).data().status, "confirmed", "on-time eligible funds");
  equal((await getTournamentFundingSources(db, timely.id)).confirmedSponsorPrizeCents, 5000, "settlement recognizes canonical source once");
  equal((await deliver(timely.session, Math.floor(Date.parse("2026-10-10T12:01:58Z") / 1000))).status, 200, "distinct duplicate delivery");
  equal((await db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", timely.recordId).get()).size, 1, "one ledger effect");
  equal((await list(request("/interests", unrelated.token), timely.params)).status, 403, "private financial agreements protected");
  const discovery = await discover(request("/discover?subjectType=tournament", sponsor.token));
  equal(discovery.status, 200, "Tournament discovery handler");
  equal((await opportunity(request("/opportunity?subjectType=tournament", sponsor.token), { params: Promise.resolve({ challengeId: timely.id }) })).status, 200, "own agreement opportunity handler");
  for (const [name, at] of [["late", "08:00"], ["equal", "02:00"], ["precision", "01:59"], ["expired", "15:00"]]) {
    const row = await prepared(name);
    equal((await window(row, at)).status, 200, "successful charge durably reconciled");
    const record = (await db.collection("sponsorContributions").doc(row.recordId).get()).data();
    equal(record.status, "payment_review_required", `${name} cannot credit`);
    equal((await db.collection("refundCases").where("paymentId", "==", row.recordId).get()).size, 1, "one review case");
    equal((await db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", row.recordId).get()).size, 0, "no ineligible credit");
    await assert.rejects(getTournamentFundingSources(db, row.id), /RECONCILIATION_REQUIRED/); assertions++;
  }
  const changed = await prepared("changed_terms");
  await db.collection("sponsorChallengeAgreements").doc(changed.agreement.id).update({ "terms.amountCents": 6000 });
  equal((await window(changed, "01:58")).status, 200, "changed terms retain successful payment for review");
  equal((await db.collection("sponsorContributions").doc(changed.recordId).get()).data().status, "payment_review_required", "accepted fingerprint cannot be bypassed");
  const delayedVoting = await prepared("actual_delay");
  await db.collection("tournaments").doc(delayedVoting.id).update({ votingStartsAt: "2026-10-10T12:02:00.000Z" });
  equal((await window(delayedVoting, "08:00", "2026-10-10T12:10:00.000Z")).status, 200, "actual transition controls cutoff");
  equal((await db.collection("sponsorContributions").doc(delayedVoting.recordId).get()).data().status, "confirmed", "planned start cannot reject a verified earlier confirmation");
  equal((await getTournamentFundingSources(db, delayedVoting.id)).confirmedSponsorPrizeCents, 5000, "actual delayed cutoff settlement recheck");
  const pi = await stripe.paymentIntents.retrieve(timely.session.payment_intent);
  const dispute = { id: `dp_${prefix}`, object: "dispute", charge: pi.latest_charge.id, payment_intent: pi.id, currency: "usd", amount: 1000, status: "needs_response", created: Math.floor(Date.now() / 1000) };
  await recordStripeSponsorDispute(db, { dispute, charge: pi.latest_charge, paymentIntent: pi, eventId: `evt_dispute_${prefix}`, eventType: "charge.dispute.created" });
  equal((await db.collection("stripeSponsorDisputes").doc(dispute.id).get()).data().tournamentId, timely.id, "dispute attributed to Tournament");
  await assert.rejects(getTournamentFundingSources(db, timely.id), /RECONCILIATION_REQUIRED/); assertions++;
  const invalid = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}" }));
  equal(invalid.status, 400, "real Stripe signature verification rejects invalid input");
  console.log(`Tournament Sponsor actual handlers: ${assertions} assertions passed. Stripe provider calls are deterministic local fixtures, not live integration verification.`);
} finally { setStripeClientForTests(null); await db.terminate(); }
