import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createPendingCreatorPrizeFunding, confirmCreatorPrizeFunding } from "../lib/server/prize-funding.ts";
import { getTournamentCreatorFunding } from "../lib/server/tournament-creator-funding.ts";
import { tournamentBasePrizeReadiness, tournamentBuilderStep, tournamentOrderedText } from "../lib/tournament-builder-policy.ts";

assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const run = `creator_${randomUUID()}`;
const ids = [];
let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }
async function fixture(suffix) {
  const id = `${run}_${suffix}`; ids.push(id);
  const tournament = { id, hostId: "creator", status: "draft", basePrizeAmountMinor: 1000, prizePool: { confirmedPrizePoolMinor: 0 } };
  await db.collection("tournaments").doc(id).set(tournament);
  const payment = await createPendingCreatorPrizeFunding(db, { challengeId: id, subjectType: "tournament", creatorId: "creator", amountCents: 1000 });
  const session = { id: `${id}_session`, mode: "payment", payment_status: "paid", amount_total: 1000, currency: "usd", payment_intent: `${id}_intent`, metadata: { paymentPurpose: "prize_pool_funding", creatorPrizeFundingId: payment.id, fundingSubjectType: "tournament", challengeId: id, userId: "creator", initiatedByUserId: "creator", organizationOwnerId: "" } };
  return { id, tournament, payment, session };
}
try {
  const first = await fixture("normal");
  equal((await getTournamentCreatorFunding(db, first.id, first.tournament)).confirmedCreatorCents, 0, "Pending money never satisfies funding");
  await assert.rejects(createPendingCreatorPrizeFunding(db, { challengeId: first.id, subjectType: "tournament", creatorId: "intruder", amountCents: 1000 }), /OWNER_MISMATCH/); assertions++;
  await assert.rejects(confirmCreatorPrizeFunding(db, { id: "event_bad_subject" }, { ...first.session, metadata: { ...first.session.metadata, fundingSubjectType: "challenge" } }), /subject metadata mismatch/); assertions++;
  await Promise.all([confirmCreatorPrizeFunding(db, { id: "event_one" }, first.session), confirmCreatorPrizeFunding(db, { id: "event_duplicate" }, first.session)]);
  equal((await getTournamentCreatorFunding(db, first.id, first.tournament)).confirmedCreatorCents, 1000, "Concurrent confirmations credit once");
  equal((await db.collection("tournaments").doc(first.id).get()).data().prizePool.confirmedPrizePoolMinor, 1000);
  equal((await db.collection("prizePools").doc(first.id).get()).data().confirmedCreatorFundingCents, 1000);
  equal((await db.collection("challengeFinancialLedger").where("challengeId", "==", first.id).get()).size, 1);
  await db.collection("creatorPrizeFundingPayments").doc(first.payment.id).update({ settlementRestricted: true });
  equal((await getTournamentCreatorFunding(db, first.id, first.tournament)).confirmedCreatorCents, 0, "A restricted payment is not eligible");
  const changed = await fixture("changed");
  await db.collection("tournaments").doc(changed.id).update({ status: "cancelled" });
  equal((await confirmCreatorPrizeFunding(db, { id: "event_cancelled" }, changed.session)).fundingStatus, "review_required");
  equal((await db.collection("tournaments").doc(changed.id).get()).data().prizePool.confirmedPrizePoolMinor, 0);
  equal((await db.collection("refundCases").where("paymentId", "==", changed.payment.id).get()).size, 1);
  await db.collection("tournaments").doc(changed.id).update({ status: "draft" });
  equal((await confirmCreatorPrizeFunding(db, { id: "event_later_duplicate" }, changed.session)).fundingStatus, "review_required", "A review payment cannot later auto-credit");
  equal((await db.collection("refundCases").where("paymentId", "==", changed.payment.id).get()).size, 1);
  equal((await db.collection("tournaments").doc(changed.id).get()).data().prizePool.confirmedPrizePoolMinor, 0);
  equal(tournamentBasePrizeReadiness(0, 0).fullyFunded, true);
  equal(tournamentBasePrizeReadiness(10000, 6000).outstandingCents, 4000);
  equal(tournamentBasePrizeReadiness(10000, 6000).fullyFunded, false);
  equal(tournamentBasePrizeReadiness(10000, 10000).fullyFunded, true);
  equal(tournamentBasePrizeReadiness(499, 500).valid, false);
  equal(tournamentBuilderStep(8, 1), "review");
  equal(tournamentBuilderStep(7, 1), "rounds");
  equal(tournamentBuilderStep(6, 2), "review");
  assert.deepEqual(tournamentOrderedText("First rule\r\n\r\nSecond rule"), ["First rule", "Second rule"]); assertions++;
  console.log(`Tournament creator funding: ${assertions} assertions passed against the local emulator and deterministic provider fixtures. No live Stripe verification.`);
} finally {
  const writer = db.bulkWriter();
  for (const id of ids) {
    for (const collection of ["creatorPrizeFundingPayments", "challengeFinancialLedger", "refundCases"]) {
      const field = collection === "refundCases" ? "tournamentId" : "challengeId";
      const records = await db.collection(collection).where(field, "==", id).get();
      records.docs.forEach(doc => writer.delete(doc.ref));
    }
    for (const collection of ["tournaments", "prizePools"]) writer.delete(db.collection(collection).doc(id));
    const audits = await db.collection("auditLogs").where("targetId", "==", id).get();
    audits.docs.forEach(doc => writer.delete(doc.ref));
  }
  await writer.close();
  await app.delete();
}
