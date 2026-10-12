import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setStripeClientForTests } from "../lib/stripe.ts";
import { expireTournamentEntryReservation } from "../lib/server/tournament-paid-entry.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
process.env.STRIPE_SECRET_KEY ??= "sk_test_tournament_entry_emulator";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_tournament_entry_emulator";
process.env.NEXT_PUBLIC_APP_URL ??= "https://challenge-suite.test";
process.env.TOURNAMENT_ENTRY_PAYMENTS_ENABLED = "true";
process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS = "true";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET ??= `${projectId}.firebasestorage.app`;
const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);
const runId = `tournament_paid_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
let webhookEvent;
let sessionSequence = 0;
const sessions = new Map();
const paymentIntents = new Map();
const charges = new Map();
const disputes = new Map();
let refundCalls = 0;

function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function request(url, token, method = "POST", body) {
  return new Request(url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
function stripeWebhookRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "deterministic-test-signature" }, body: "signed-test-fixture"
  });
}
async function createUser(label) {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Strong-test-password-123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await Promise.all([
    db.collection("users").doc(body.localId).set({ emailVerified: true, role: "creator", accountType: "creator", accountStatus: "active", displayName: label }),
    db.collection("profiles").doc(body.localId).set({ displayName: label, username: label.toLowerCase() })
  ]);
  return { uid: body.localId, token: body.idToken };
}
function tournament(id, overrides = {}) {
  return {
    id, hostId: `${runId}_host`, configVersion: 3, entryType: "paid_entry_setup_required",
    entryFeeAmountMinor: 500, currency: "USD", paymentActivationEnabled: true,
    participationMode: "individual", status: "registration_open", registrationType: "open",
    participantCapacity: 1, participantCount: 0, resultMethod: "votes", ...overrides
  };
}
function mockProvider() {
  const stripe = { checkout: { sessions: {} }, paymentIntents: {}, charges: {}, disputes: {}, refunds: {}, webhooks: {} };
  stripe.checkout.sessions.create = async (params, options) => {
    assert.ok(options?.idempotencyKey, "checkout uses a stable reservation idempotency key");
    const sequence = ++sessionSequence;
    const id = `cs_${runId}_${sequence}`;
    const paymentIntentId = `pi_${runId}_${sequence}`;
    const session = {
      id, object: "checkout.session", mode: "payment", status: "open", payment_status: "unpaid",
      amount_total: params.line_items[0].price_data.unit_amount,
      currency: params.line_items[0].price_data.currency,
      payment_method_types: params.payment_method_types,
      payment_intent: null,
      metadata: params.metadata,
      expires_at: params.expires_at,
      url: `https://checkout.example.test/${id}`
    };
    sessions.set(id, { ...session, pendingPaymentIntentId: paymentIntentId });
    return session;
  };
  stripe.checkout.sessions.retrieve = async (id) => {
    const session = sessions.get(id);
    assert.ok(session, `retrieved only a created fixture session: ${id}`);
    return { ...session, payment_intent: session.payment_status === "paid" ? session.pendingPaymentIntentId : null };
  };
  stripe.paymentIntents.retrieve = async (id) => {
    const paymentIntent = paymentIntents.get(id);
    assert.ok(paymentIntent, `retrieved only a verified card PaymentIntent fixture: ${id}`);
    return paymentIntent;
  };
  stripe.charges.retrieve = async (id) => {
    const charge = charges.get(id);
    assert.ok(charge, `retrieved only a created card Charge fixture: ${id}`);
    return charge;
  };
  stripe.disputes.retrieve = async (id) => {
    const dispute = disputes.get(id);
    assert.ok(dispute, `retrieved only a created Stripe dispute fixture: ${id}`);
    return dispute;
  };
  stripe.refunds.create = async (params, options) => {
    refundCalls += 1;
    assert.ok(options?.idempotencyKey, "mandatory refund uses a provider idempotency key");
    const paymentIntent = paymentIntents.get(params.payment_intent);
    assert.ok(paymentIntent, "refund links to the confirmed PaymentIntent");
    return { id: `re_${params.metadata.refundCaseId}`, status: "succeeded", amount: paymentIntent.amount_received, currency: paymentIntent.currency, payment_intent: paymentIntent.id, metadata: params.metadata };
  };
  stripe.webhooks.constructEvent = () => webhookEvent;
  setStripeClientForTests(stripe);
  return stripe;
}
function paidProviderState(sessionId) {
  const original = sessions.get(sessionId);
  assert.ok(original);
  const paymentIntentId = original.pendingPaymentIntentId;
  const chargeId = `ch_${paymentIntentId}`;
  const charge = {
    id: chargeId, object: "charge", status: "succeeded", paid: true, captured: true,
    amount: original.amount_total, amount_captured: original.amount_total, currency: original.currency,
    payment_intent: paymentIntentId, payment_method_details: { type: "card" }
  };
  paymentIntents.set(paymentIntentId, {
    id: paymentIntentId, object: "payment_intent", status: "succeeded", capture_method: "automatic",
    amount: original.amount_total, amount_received: original.amount_total, currency: original.currency,
    latest_charge: charge
  });
  charges.set(chargeId, charge);
  sessions.set(sessionId, { ...original, status: "complete", payment_status: "paid" });
}
function webhookFor(sessionId, suffix) {
  const session = sessions.get(sessionId);
  webhookEvent = {
    id: `evt_${runId}_${suffix}`, object: "event", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000),
    data: { object: { ...session, payment_intent: session.pendingPaymentIntentId } }
  };
}
function webhookForDispute(sessionId, suffix) {
  const paymentIntentId = sessions.get(sessionId).pendingPaymentIntentId;
  const charge = [...charges.values()].find((item) => item.payment_intent === paymentIntentId);
  const dispute = { id: `dp_${runId}_${suffix}`, object: "dispute", status: "needs_response", amount: charge.amount, currency: charge.currency, charge: charge.id, payment_intent: paymentIntentId, created: Math.floor(Date.now() / 1000) };
  disputes.set(dispute.id, dispute);
  webhookEvent = { id: `evt_${runId}_${suffix}`, object: "event", type: "charge.dispute.created", created: Math.floor(Date.now() / 1000), data: { object: dispute } };
}
async function deliverPaidWebhook(webhook, sessionId, suffix) {
  paidProviderState(sessionId);
  webhookFor(sessionId, suffix);
  return webhook(stripeWebhookRequest());
}

try {
  const stripe = mockProvider();
  const { POST: join } = await import("../app/api/tournaments/[id]/join/route.ts");
  const { POST: teams } = await import("../app/api/tournaments/[id]/teams/route.ts");
  const { POST: webhook } = await import("../app/api/stripe/webhook/route.ts");
  const { GET: paymentStatus } = await import("../app/api/tournaments/[id]/entry-payment/route.ts");
  const tournamentId = `${runId}_capacity_race`;
  const [first, second] = await Promise.all([createUser("first"), createUser("second")]);
  await db.collection("tournaments").doc(tournamentId).set(tournament(tournamentId));
  const joinResponses = await Promise.all([first, second].map((user) => join(request(`http://localhost/api/tournaments/${tournamentId}/join`, user.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: tournamentId }) })));
  equal(joinResponses.filter((response) => response.status === 200).length, 1, "concurrent last-slot Checkout attempts reserve exactly one capacity slot");
  equal(joinResponses.filter((response) => response.status === 409).length, 1, "the competing paid registration receives a capacity conflict");
  const acceptedResponse = joinResponses.find((response) => response.status === 200);
  const acceptedBody = (await acceptedResponse.json()).data;
  const reservation = (await db.collection("tournamentEntryReservations").doc(acceptedBody.reservationId).get()).data();
  equal(Date.parse(reservation.reservationExpiresAt) - Date.parse(reservation.reservationCreatedAt), 10 * 60 * 1000, "reservation is persisted for exactly ten minutes");
  check(reservation.amountCents === 500 && reservation.currency === "usd", "reservation captures the configured amount and currency");
  equal((await db.collection("tournaments").doc(tournamentId).get()).data()?.participantCount, 0, "a reservation does not count as a confirmed entrant");
  const pendingParticipantDocs = await db.collection("tournamentParticipants").where("tournamentId", "==", tournamentId).get();
  equal(pendingParticipantDocs.size, 0, "a pending reservation creates no participant record and cannot affect activation");
  const createdSession = [...sessions.values()].find((session) => session.metadata.tournamentId === tournamentId);
  check(Boolean(createdSession) && createdSession.expires_at - Math.floor(Date.now() / 1000) >= 30 * 60, "Stripe session meets its provider minimum while the 10-minute reservation remains authoritative");
  const paidResponse = await deliverPaidWebhook(webhook, createdSession.id, "capacity_race_paid");
  equal(paidResponse.status, 200, "valid card Checkout webhook is accepted");
  const registered = (await db.collection("tournamentParticipants").doc(`${tournamentId}_${createdSession.metadata.userId}`).get()).data();
  equal(registered.status, "registered", "provider-confirmed payment completes registration");
  equal((await db.collection("tournaments").doc(tournamentId).get()).data()?.participantCount, 1, "confirmed entry increments participant count exactly once");
  const entryConfirmations = await db.collection("notifications").where("userId", "==", createdSession.metadata.userId).where("metadata.paymentId", "==", createdSession.metadata.paymentId).get();
  equal(entryConfirmations.size, 1, `payer receives one idempotent in-app confirmation (matching notifications: ${entryConfirmations.size})`);
  const expectedConfirmationId = `tournament_entry_${createHash("sha256").update(createdSession.metadata.paymentId).digest("hex")}_confirmed`;
  equal(entryConfirmations.docs[0]?.id, expectedConfirmationId, "confirmation notification uses a bounded, collision-resistant payment-scoped idempotency key");
  equal(entryConfirmations.docs[0]?.data()?.metadata?.paymentStatus, "confirmed", "confirmation notification records the authoritative payment status");
  const duplicateWebhook = await deliverPaidWebhook(webhook, createdSession.id, "capacity_race_duplicate");
  equal(duplicateWebhook.status, 200, "duplicate signed payment delivery is acknowledged");
  equal((await db.collection("notifications").where("userId", "==", createdSession.metadata.userId).where("metadata.paymentId", "==", createdSession.metadata.paymentId).get()).size, 1, "duplicate payment webhook does not duplicate the confirmation notification");
  equal((await db.collection("tournamentFinancialLedger").where("paymentId", "==", createdSession.metadata.paymentId).get()).size, 1, "duplicate webhook creates one financial ledger row");
  const statusResponse = await paymentStatus(request(`http://localhost/api/tournaments/${tournamentId}/entry-payment?session_id=${createdSession.id}`, createdSession.metadata.userId === first.uid ? first.token : second.token, "GET"), { params: Promise.resolve({ id: tournamentId }) });
  equal(statusResponse.status, 200, "payer can read their payment state without using the browser success URL as proof");
  equal((await statusResponse.json()).data.status, "confirmed", "status API reports only webhook-confirmed registration");
  const refundedUnauthorizedStatus = await paymentStatus(request(`http://localhost/api/tournaments/${tournamentId}/entry-payment?session_id=${createdSession.id}`, createdSession.metadata.userId === first.uid ? second.token : first.token, "GET"), { params: Promise.resolve({ id: tournamentId }) });
  equal(refundedUnauthorizedStatus.status, 403, "another entrant cannot inspect the payer's payment state");

  const lateAvailableId = `${runId}_late_available`;
  const lateUser = await createUser("late_available");
  await db.collection("tournaments").doc(lateAvailableId).set(tournament(lateAvailableId, { participantCapacity: 2 }));
  const lateStart = await join(request(`http://localhost/api/tournaments/${lateAvailableId}/join`, lateUser.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: lateAvailableId }) });
  equal(lateStart.status, 200, "late-success fixture obtains a real route-created reservation");
  const lateBody = (await lateStart.json()).data;
  const lateSession = [...sessions.values()].find((session) => session.metadata.reservationId === lateBody.reservationId);
  const expiredResult = await expireTournamentEntryReservation(db, await stripe.checkout.sessions.retrieve(lateSession.id), new Date(Date.parse(lateBody.reservationExpiresAt) + 1));
  equal(expiredResult.expired, true, "reservation expiry is persisted at the strict ten-minute boundary");
  const latePaid = await deliverPaidWebhook(webhook, lateSession.id, "late_payment_capacity_available");
  equal(latePaid.status, 200, "successful late payment is rechecked rather than trusted or rejected blindly");
  equal((await db.collection("tournamentParticipants").doc(`${lateAvailableId}_${lateUser.uid}`).get()).data()?.status, "registered", "late successful payment is accepted when a fresh slot remains available");
  equal((await db.collection("tournaments").doc(lateAvailableId).get()).data()?.participantCount, 1, "late eligible success consumes one slot atomically");

  const failedId = `${runId}_failed_payment`;
  const failedUser = await createUser("failed_payment");
  await db.collection("tournaments").doc(failedId).set(tournament(failedId));
  const failedCheckoutResponse = await join(request(`http://localhost/api/tournaments/${failedId}/join`, failedUser.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: failedId }) });
  equal(failedCheckoutResponse.status, 200, "failed-payment fixture creates an actual paid reservation");
  const failedCheckout = (await failedCheckoutResponse.json()).data;
  const failedSession = [...sessions.values()].find((session) => session.metadata.reservationId === failedCheckout.reservationId);
  webhookEvent = { id: `evt_${runId}_failed_payment`, object: "event", type: "checkout.session.async_payment_failed", created: Math.floor(Date.now() / 1000), data: { object: failedSession } };
  equal((await webhook(stripeWebhookRequest())).status, 200, "verified unpaid failure releases its Tournament reservation");
  equal((await db.collection("tournamentEntryPayments").doc(failedCheckout.reservationId).get()).data()?.status, "payment_failed", "failed provider payment is durably recorded");
  const activeFailedLocks = await db.collection("tournamentEntryReservationLocks").where("tournamentId", "==", failedId).where("activeReservationId", "==", failedCheckout.reservationId).get();
  equal(activeFailedLocks.size, 0, "failed individual payment clears the same participant reservation lock used at checkout");
  const failedNotifications = await db.collection("notifications").where("userId", "==", failedUser.uid).where("metadata.paymentId", "==", failedCheckout.reservationId).get();
  equal(failedNotifications.size, 1, "payer receives one idempotent failed-payment notification");
  equal(failedNotifications.docs[0]?.data()?.type, "tournament_entry_payment_failed", "failed notification identifies the payment outcome");
  webhookEvent = { id: `evt_${runId}_failed_payment`, object: "event", type: "checkout.session.async_payment_failed", created: Math.floor(Date.now() / 1000), data: { object: failedSession } };
  equal((await webhook(stripeWebhookRequest())).status, 200, "duplicate unpaid failure webhook is acknowledged");
  equal((await db.collection("notifications").where("userId", "==", failedUser.uid).where("metadata.paymentId", "==", failedCheckout.reservationId).get()).size, 1, "duplicate failure webhook does not duplicate its notification");

  const fullId = `${runId}_late_full`;
  const [latePayer, winningPayer] = await Promise.all([createUser("late_full"), createUser("slot_winner")]);
  await db.collection("tournaments").doc(fullId).set(tournament(fullId));
  const oldCheckout = await join(request(`http://localhost/api/tournaments/${fullId}/join`, latePayer.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: fullId }) });
  equal(oldCheckout.status, 200, "old checkout fixture reserves a slot");
  const oldBody = (await oldCheckout.json()).data;
  const oldSession = [...sessions.values()].find((session) => session.metadata.reservationId === oldBody.reservationId);
  await expireTournamentEntryReservation(db, await stripe.checkout.sessions.retrieve(oldSession.id), new Date(Date.parse(oldBody.reservationExpiresAt) + 1));
  const newCheckout = await join(request(`http://localhost/api/tournaments/${fullId}/join`, winningPayer.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: fullId }) });
  equal(newCheckout.status, 200, "expired reservation releases capacity for a new entrant");
  const newBody = (await newCheckout.json()).data;
  const newSession = [...sessions.values()].find((session) => session.metadata.reservationId === newBody.reservationId);
  paidProviderState(newSession.id);
  webhookFor(newSession.id, "late_full_winner");
  equal((await webhook(stripeWebhookRequest())).status, 200, "new entrant's provider-confirmed payment fills the freed slot");
  paidProviderState(oldSession.id);
  webhookFor(oldSession.id, "late_full_old_payment");
  const oldPaymentResponse = await webhook(stripeWebhookRequest());
  equal(oldPaymentResponse.status, 200, "late payment for an unavailable slot is reconciled instead of registered");
  const oldPayment = (await db.collection("tournamentEntryPayments").doc(oldBody.reservationId).get()).data();
  equal(oldPayment.status, "refunded", "late successful payment receives an idempotent full reversal");
  equal((await db.collection("tournamentParticipants").doc(`${fullId}_${latePayer.uid}`).get()).exists, false, "refund for the duplicate/late charge does not create or remove a participant");
  equal((await db.collection("tournaments").doc(fullId).get()).data()?.participantCount, 1, "late refund does not decrement another entrant's count");
  equal(refundCalls, 1, "the provider refund is initiated once");
  const mandatoryRefund = await db.collection("refundCases").where("paymentId", "==", oldBody.reservationId).limit(1).get();
  check(mandatoryRefund.size === 1 && Boolean((await db.collection("cashLedger").doc(`refund_${mandatoryRefund.docs[0].id}`).get()).exists), "full refund writes an idempotent cash-ledger record");

  const priceChangeId = `${runId}_price_change`;
  const priceChangeUser = await createUser("price_change");
  await db.collection("tournaments").doc(priceChangeId).set(tournament(priceChangeId, { participantCapacity: 2 }));
  const priceCheckoutResponse = await join(request(`http://localhost/api/tournaments/${priceChangeId}/join`, priceChangeUser.token, "POST", { rulesAccepted: true }), { params: Promise.resolve({ id: priceChangeId }) });
  equal(priceCheckoutResponse.status, 200, "price-change fixture obtains a saved entry reservation");
  const priceCheckout = (await priceCheckoutResponse.json()).data;
  const priceSession = [...sessions.values()].find((session) => session.metadata.reservationId === priceCheckout.reservationId);
  await db.collection("tournaments").doc(priceChangeId).set({ entryFeeAmountMinor: 900 }, { merge: true });
  equal((await deliverPaidWebhook(webhook, priceSession.id, "price_changed_during_checkout")).status, 200, "provider-confirmed payment at a superseded entry price is reconciled");
  equal((await db.collection("tournamentParticipants").doc(`${priceChangeId}_${priceChangeUser.uid}`).get()).exists, false, "superseded price does not create a Tournament entrant");
  equal((await db.collection("tournamentEntryPayments").doc(priceCheckout.reservationId).get()).data()?.refundReason, "TOURNAMENT_ENTRY_PRICE_CHANGED", "superseded-price payment enters the mandatory refund workflow with an auditable reason");

  const teamTournamentId = `${runId}_team`;
  const captain = await createUser("team_captain");
  const teammate = await createUser("team_member");
  const teamId = `${teamTournamentId}_team_fixture`;
  await Promise.all([
    db.collection("tournaments").doc(teamTournamentId).set(tournament(teamTournamentId, { participationMode: "team", teamConfig: { minimumSize: 2, maximumSize: 4 } })),
    db.collection("tournamentTeams").doc(teamId).set({ id: teamId, tournamentId: teamTournamentId, captainUserId: captain.uid, memberUserIds: [captain.uid, teammate.uid], status: "forming", paymentStatus: "pending", rosterLockedAt: null }),
    db.collection("tournamentTeamMemberships").doc(`${teamTournamentId}_${captain.uid}`).set({ id: `${teamTournamentId}_${captain.uid}`, tournamentId: teamTournamentId, teamId, userId: captain.uid, role: "captain", status: "active" }),
    db.collection("tournamentTeamMemberships").doc(`${teamTournamentId}_${teammate.uid}`).set({ id: `${teamTournamentId}_${teammate.uid}`, tournamentId: teamTournamentId, teamId, userId: teammate.uid, role: "member", status: "active" })
  ]);
  const teamCheckoutResponse = await teams(request(`http://localhost/api/tournaments/${teamTournamentId}/teams`, captain.token, "POST", { action: "ready", teamId, rulesAccepted: true }), { params: Promise.resolve({ id: teamTournamentId }) });
  equal(teamCheckoutResponse.status, 200, `Captain can start team checkout after roster validation (${await teamCheckoutResponse.clone().text()})`);
  const teamCheckout = (await teamCheckoutResponse.json()).data;
  check(Boolean(teamCheckout.checkoutUrl), "team registration returns a secure Checkout URL");
  const teamSession = [...sessions.values()].find((session) => session.metadata.reservationId === teamCheckout.reservationId);
  const teamPaid = await deliverPaidWebhook(webhook, teamSession.id, "team_confirmed");
  equal(teamPaid.status, 200, "team card payment is processed through the Stripe webhook route");
  const savedTeam = (await db.collection("tournamentTeams").doc(teamId).get()).data();
  equal(savedTeam.status, "ready", "team becomes ready only after confirmed card payment");
  equal(savedTeam.paymentStatus, "confirmed", "team payment state follows provider confirmation");
  check(Boolean(savedTeam.rosterLockedAt), "successful payment locks the validated roster");
  equal((await db.collection("tournaments").doc(teamTournamentId).get()).data()?.participantCount, 1, "a paid team consumes one bracket slot, not one per member");
  webhookForDispute(teamSession.id, "entry_dispute");
  const disputeResponse = await webhook(stripeWebhookRequest());
  equal(disputeResponse.status, 200, "verified Tournament chargeback webhook is persisted");
  const disputePayment = (await db.collection("tournamentEntryPayments").doc(teamCheckout.reservationId).get()).data();
  equal(disputePayment.financialRestriction, "stripe_dispute", "disputed paid entry is financially restricted");
  equal((await db.collection("tournaments").doc(teamTournamentId).get()).data()?.financialHold, true, "Tournament dispute freezes result/settlement operations server-side");
  equal((await db.collection("tournamentEntryDisputes").where("tournamentId", "==", teamTournamentId).get()).size, 1, "Admin-readable Tournament dispute record links to the paid entry");

  console.log(`PASS Tournament paid-entry actual join/team/webhook/status handlers and Firestore Emulator: ${assertions} assertions.`);
} finally {
  setStripeClientForTests(null);
  await db.terminate();
  await app.delete();
}
