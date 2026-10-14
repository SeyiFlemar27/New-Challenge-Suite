import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createPendingEntryPayment, confirmChallengeEntryPayment, checkoutMetadataForPurpose } from "../lib/server/monetization-payments.ts";
import { reconcileNormalEntryCheckout } from "../lib/server/normal-entry-reconciliation.ts";
const confirmEntryPayment = (db, session, event) => confirmChallengeEntryPayment(db, event, session);
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `normal_paid_${randomUUID()}`;
const challenges = [];
let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions++; };
async function fixture(label, capacity = 1, enterprise = false) {
  const now = Date.now();
  const id = `${prefix}_${label}`; challenges.push(id);
  const challenge = { id, builderVersion: "normal_v3", challengeType: "normal", type: "Public Challenge", status: "registration_open", creatorId: "fixture_creator", visibility: "public", publishedAt: new Date(now - 60_000).toISOString(), startsAt: new Date(now + 3_600_000).toISOString(), registrationOpensAt: new Date(now - 60_000).toISOString(), registrationDeadline: new Date(now + 3_600_000).toISOString(), submissionStartAt: new Date(now + 3_600_000).toISOString(), submissionDeadline: new Date(now + 7_200_000).toISOString(), endsAt: new Date(now + 14_400_000).toISOString(), votingStartsAt: new Date(now + 7_200_000).toISOString(), votingDeadline: new Date(now + 10_800_000).toISOString(), paidEntryEnabled: true, entryFeeAmountCents: 500, maxParticipants: capacity, participantCount: 0 };
  if (enterprise) { challenge.organizationOwnerId = "fixture_enterprise"; challenge.workspaceType = "enterprise"; }
  await db.collection("challenges").doc(id).set(challenge);
  const payment = await createPendingEntryPayment(db, { challengeId: id, userId: "fixture_user", challenge });
  const session = { id: `cs_${id}`, mode: "payment", payment_status: "paid", amount_total: 500, currency: "usd", payment_intent: `pi_${id}`, metadata: checkoutMetadataForPurpose("challenge_entry_fee", payment) };
  const event = { id: `evt_${id}`, type: "checkout.session.completed" };
  await db.collection("challengeEntryPayments").doc(payment.id).update({ providerSessionId: session.id });
  return { id, challenge, payment, session, event };
}
try {
  const retry = await fixture("retry");
  const later = await createPendingEntryPayment(db, { challengeId: retry.id, userId: "fixture_user", challenge: retry.challenge, now: new Date(Date.parse(retry.payment.createdAt) + 60_000).toISOString() });
  equal(later.reservationExpiresAt, retry.payment.reservationExpiresAt, "retry does not extend 20-minute reservation");
  equal(Date.parse(later.reservationExpiresAt) - Date.parse(later.createdAt), 20 * 60_000, "reservation duration is exactly 20 minutes");
  const outcomes = await Promise.all([confirmEntryPayment(db, retry.session, retry.event), confirmEntryPayment(db, retry.session, retry.event)]);
  equal(outcomes.filter(value => value.duplicate).length, 1, "concurrent confirmation credits once");
  equal((await db.collection("challenges").doc(retry.id).get()).data().participantCount, 1, "enrollment count increments once");
  const late = await fixture("late");
  await db.collection("challengeEntryPayments").doc(late.payment.id).update({ reservationExpiresAt: new Date(Date.now() - 1).toISOString() });
  equal((await confirmEntryPayment(db, late.session, late.event)).enrollmentActivated, true, "late confirmation enrolls when registration and capacity remain available");
  const full = await fixture("full");
  await db.collection("challengeParticipants").doc(`${full.id}_other`).set({ challengeId: full.id, userId: "other", status: "active", entryPaymentStatus: "paid" });
  equal((await confirmEntryPayment(db, full.session, full.event)).reviewRequired, true, "capacity unavailable routes successful payment to review");
  equal((await confirmEntryPayment(db, full.session, { ...full.event, id: `${full.event.id}_duplicate` })).duplicate, true, "reviewed payment cannot be credited by duplicate event");
  equal((await db.collection("challengeParticipants").doc(`${full.id}_fixture_user`).get()).exists, false, "review creates no admitted participant");
  const withdrawn = await fixture("withdrawn");
  await db.collection("challengeParticipants").doc(`${withdrawn.id}_fixture_user`).set({ challengeId: withdrawn.id, userId: "fixture_user", status: "withdrawn" });
  equal((await confirmEntryPayment(db, withdrawn.session, withdrawn.event)).reviewRequired, true, "payment does not reactivate withdrawn participation");
  const closed = await fixture("closed");
  await db.collection("challenges").doc(closed.id).update({ status: "cancelled" });
  equal((await confirmEntryPayment(db, closed.session, closed.event)).reviewRequired, true, "cancelled challenge does not admit paid entry");
  const extra = await confirmEntryPayment(db, { ...retry.session, id: `${retry.session.id}_extra`, payment_intent: "pi_extra" }, { ...retry.event, id: "evt_extra" });
  equal(extra.reviewRequired, true, "extra successful charge is recorded for review");
  equal((await db.collection("challengeEntryPayments").doc(retry.payment.id).get()).data().providerSessionId, retry.session.id, "extra charge does not overwrite original paid source");
  const history = await fixture("large_history");
  for (let page = 0; page < 2; page++) {
    const batch = db.batch();
    for (let index = page * 500; index < (page + 1) * 500; index++) batch.set(db.collection("challengeParticipants").doc(`${history.id}_a_${String(index).padStart(4, "0")}`), { challengeId: history.id, userId: `historical_${index}`, status: "withdrawn" });
    await batch.commit();
  }
  await db.collection("challengeParticipants").doc(`${history.id}_z_active`).set({ challengeId: history.id, userId: "active_after_history", status: "active", entryPaymentStatus: "paid" });
  equal((await confirmEntryPayment(db, history.session, history.event)).reviewRequired, true, "capacity includes active participants beyond 1000 historical records");
  equal((await db.collection("challengeParticipants").doc(`${history.id}_fixture_user`).get()).exists, false, "truncated historical inventory cannot cause over-enrollment");
  const restart = await fixture("restart", 2);
  await db.collection("challengeEntryPayments").doc(restart.payment.id).update({ reservationExpiresAt: new Date(Date.now() - 1).toISOString() });
  let providerSession = { ...restart.session, status: "open", payment_status: "unpaid" };
  let expireCalls = 0;
  const provider = { checkout: { sessions: { retrieve: async () => providerSession, expire: async () => { expireCalls++; providerSession = { ...providerSession, status: "expired" }; return providerSession; } } }, paymentIntents: { retrieve: async id => ({ id, status: "canceled", amount_received: 0 }) } };
  equal((await reconcileNormalEntryCheckout(db, provider, restart.id, "fixture_user")).restartAllowed, true, "terminal unpaid provider evidence permits restart");
  equal(expireCalls, 1, "open session expired through provider before restart");
  const nextAttempts = await Promise.all([createPendingEntryPayment(db, { challengeId: restart.id, userId: "fixture_user", challenge: restart.challenge }), createPendingEntryPayment(db, { challengeId: restart.id, userId: "fixture_user", challenge: restart.challenge })]);
  equal(nextAttempts[0].id, nextAttempts[1].id, "concurrent restart produces one new attempt");
  equal(nextAttempts[0].id === restart.payment.id, false, "original payment record retained separately");
  equal((await db.collection("challengeEntryPayments").doc(restart.payment.id).get()).data().providerSessionId, restart.session.id, "original provider reference retained");
  const ambiguous = await fixture("ambiguous");
  await db.collection("challengeEntryPayments").doc(ambiguous.payment.id).update({ reservationExpiresAt: new Date(Date.now() - 1).toISOString() });
  const uncertainProvider = { checkout: { sessions: { retrieve: async () => ({ ...ambiguous.session, status: "complete", payment_status: "paid" }) } }, paymentIntents: { retrieve: async id => ({ id, status: "succeeded", amount_received: 500 }) } };
  equal((await reconcileNormalEntryCheckout(db, uncertainProvider, ambiguous.id, "fixture_user")).restartAllowed, false, "successful payment cannot authorize a second charge");
  await assert.rejects(createPendingEntryPayment(db, { challengeId: ambiguous.id, userId: "fixture_user", challenge: ambiguous.challenge }), /ENTRY_RESERVATION_EXPIRED/); assertions++;
  const restartClosed = await fixture("restart_closed");
  await db.collection("challenges").doc(restartClosed.id).update({ status: "cancelled" });
  await assert.rejects(createPendingEntryPayment(db, { challengeId: restartClosed.id, userId: "fixture_user", challenge: restartClosed.challenge }), /ENTRY_REGISTRATION_CLOSED/); assertions++;
  const enterprise = await fixture("enterprise_restart", 2, true);
  await db.collection("challengeEntryPayments").doc(enterprise.payment.id).update({ reservationExpiresAt: new Date(Date.now() - 1).toISOString() });
  const enterpriseProvider = { checkout: { sessions: { retrieve: async () => ({ ...enterprise.session, status: "expired", payment_status: "unpaid" }) } }, paymentIntents: { retrieve: async id => ({ id, status: "canceled", amount_received: 0 }) } };
  const enterpriseResults = await Promise.all([reconcileNormalEntryCheckout(db, enterpriseProvider, enterprise.id, "fixture_user"), reconcileNormalEntryCheckout(db, enterpriseProvider, enterprise.id, "fixture_user")]);
  equal(enterpriseResults.every(item => item.restartAllowed), true, "Enterprise terminal-unpaid reconciliation permits safe restart");
  const enterpriseLimit = db.collection("enterprisePrizeFundingLimits").doc(enterprise.id);
  equal((await enterpriseLimit.get()).data().additionalReservedCents, 0, "concurrent reconciliation releases Enterprise exposure only once");
  const enterpriseNext = await createPendingEntryPayment(db, { challengeId: enterprise.id, userId: "fixture_user", challenge: enterprise.challenge });
  equal(enterpriseNext.id === enterprise.payment.id, false, "Enterprise retry preserves original payment record");
  equal((await enterpriseLimit.get()).data().additionalReservedCents, enterpriseNext.winnerShareCents, "replacement reserves only the new Enterprise exposure");
  equal((await enterpriseLimit.get()).data().confirmedCents, 0, "unpaid reconciliation does not create confirmed Enterprise funds");
  console.log(`Normal paid-entry emulator: ${assertions} assertions passed.`);
} finally {
  for (const id of challenges) {
    for (const collection of ["challengeEntryPayments", "normalEntryAttempts", "challengeParticipants", "challengeFinancialLedger", "refundCases", "auditLogs"]) {
      const records = await db.collection(collection).where("challengeId", "==", id).get();
      await Promise.all(records.docs.map(record => record.ref.delete()));
    }
    await db.collection("challenges").doc(id).delete();
    await db.collection("enterprisePrizeFundingLimits").doc(id).delete();
  }
  await deleteApp(app);
}
