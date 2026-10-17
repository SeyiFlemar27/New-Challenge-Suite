import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createTournamentEntryCheckout, confirmTournamentEntryPayment } from "../lib/server/tournament-paid-entry.ts";
import { expireTournamentTeamAttempt } from "../lib/server/tournament-team-entry.ts";
import { TOURNAMENT_PRODUCT_POLICY } from "../lib/tournament-builder-policy.ts";

assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const run = `members_${randomUUID()}`;
const ids = [], users = [];
const sessions = new Map();
let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }
const stripe = { checkout: { sessions: { create: async (params, options) => {
  const key = options.idempotencyKey;
  if (sessions.has(key)) return sessions.get(key);
  const session = { ...params, id: `cs_${sessions.size}`, url: "https://checkout.stripe.test/fixture", amount_total: params.line_items[0].price_data.unit_amount, currency: "usd", payment_status: "unpaid", payment_intent: `pi_${sessions.size}` };
  sessions.set(key, session);
  return session;
} } } };
function completion(checkout) {
  const original = [...sessions.values()].find(session => session.id === checkout.checkoutSessionId);
  const session = { ...original, payment_status: "paid" };
  const charge = { id: `ch_${session.payment_intent}`, status: "succeeded", paid: true, captured: true, amount_captured: 500, currency: "usd", payment_intent: session.payment_intent, payment_method_details: { type: "card" } };
  return { session, evidence: { charge, paymentIntent: { id: session.payment_intent, status: "succeeded", capture_method: "automatic", amount_received: 500, currency: "usd", latest_charge: charge } } };
}
async function fixture(name, teamCount = 1, capacity = 4) {
  const id = `${run}_${name}`; ids.push(id);
  await db.collection("tournaments").doc(id).set({ id, hostId: "host", configVersion: 3, productPolicyVersion: TOURNAMENT_PRODUCT_POLICY, participationMode: "team", status: "registration_open", entryType: "paid_entry_setup_required", entryFeeAmountMinor: 500, currency: "USD", paymentActivationEnabled: true, participantCapacity: capacity, participantCount: 0, teamPaymentWindowMinutes: 60, teamConfig: { minimumSize: 2, maximumSize: 5 } });
  const teams = [];
  for (let index = 0; index < teamCount; index++) {
    const teamId = `${id}_team_${index}`;
    const memberIds = [`${teamId}_captain`, `${teamId}_member`]; users.push(...memberIds);
    await db.collection("tournamentTeams").doc(teamId).set({ id: teamId, tournamentId: id, captainUserId: memberIds[0], memberUserIds: memberIds, status: "forming", rosterLockedAt: null });
    for (let member = 0; member < 2; member++) {
      await db.collection("users").doc(memberIds[member]).set({ accountStatus: "active", role: "user", displayName: "Test member" });
      await db.collection("tournamentTeamMemberships").doc(`${id}_${memberIds[member]}`).set({ tournamentId: id, teamId, userId: memberIds[member], status: "active", role: member ? "member" : "captain" });
    }
    teams.push({ teamId, memberIds });
  }
  return { id, teams };
}
const checkout = (fixture, team, userId) => createTournamentEntryCheckout(db, stripe, { tournamentId: fixture.id, target: { mode: "team", teamId: team.teamId, userId }, rulesAccepted: true, appUrl: "http://localhost:3000" });
try {
  console.log("Member payment regression: reservation and concurrent duplicate confirmation");
  const first = await fixture("concurrent_members");
  const team = first.teams[0];
  await assert.rejects(checkout(first, team, team.memberIds[1]), /captain must start/); assertions++;
  const captain = await checkout(first, team, team.memberIds[0]);
  const member = await checkout(first, team, team.memberIds[1]);
  equal(captain.teamAttemptId, member.teamAttemptId);
  equal(captain.amountCents, 500, "Captain pays only their own fee");
  equal(member.amountCents, 500, "Member pays their own fee");
  equal(Date.parse(captain.expiresAt) - Date.parse((await db.collection("tournamentTeamRegistrationAttempts").doc(captain.teamAttemptId).get()).data().createdAt), 60 * 60_000);
  const paidCaptain = completion(captain), paidMember = completion(member);
  const firstResult = await confirmTournamentEntryPayment(db, paidCaptain.session, paidCaptain.evidence);
  equal(firstResult.status, "member_confirmed");
  equal((await db.collection("tournaments").doc(first.id).get()).data().participantCount, 0);
  equal((await db.collection("tournamentTeams").doc(team.teamId).get()).data().status, "forming");
  await Promise.all([confirmTournamentEntryPayment(db, paidMember.session, paidMember.evidence), confirmTournamentEntryPayment(db, paidMember.session, paidMember.evidence)]);
  equal((await db.collection("tournaments").doc(first.id).get()).data().participantCount, 1);
  equal((await db.collection("tournamentTeams").doc(team.teamId).get()).data().status, "ready");
  equal((await db.collection("tournamentFinancialLedger").where("tournamentId", "==", first.id).get()).size, 2);
  equal((await confirmTournamentEntryPayment(db, paidCaptain.session, paidCaptain.evidence)).duplicate, true);
  const capacity = await fixture("capacity", 5);
  console.log("Member payment regression: five concurrent teams competing for four slots");
  const attempts = await Promise.allSettled(capacity.teams.map(team => checkout(capacity, team, team.memberIds[0])));
  equal(attempts.filter(result => result.status === "fulfilled").length, 4, "One temporary reservation per team, never one per member");
  equal(attempts.filter(result => result.status === "rejected").length, 1);
  const expired = await fixture("expired");
  console.log("Member payment regression: partial registration expiry and duplicate reconciliation");
  const expTeam = expired.teams[0];
  const expCaptain = await checkout(expired, expTeam, expTeam.memberIds[0]);
  const expMember = await checkout(expired, expTeam, expTeam.memberIds[1]);
  const expPaidCaptain = completion(expCaptain), expPaidMember = completion(expMember);
  await confirmTournamentEntryPayment(db, expPaidCaptain.session, expPaidCaptain.evidence);
  const atExpiry = new Date(expCaptain.expiresAt);
  equal((await expireTournamentTeamAttempt(db, expCaptain.teamAttemptId, atExpiry)).status, "expired");
  equal((await db.collection("refundCases").where("tournamentId", "==", expired.id).get()).size, 1);
  equal((await confirmTournamentEntryPayment(db, expPaidMember.session, expPaidMember.evidence, atExpiry)).status, "refund_review_required");
  equal((await confirmTournamentEntryPayment(db, expPaidMember.session, expPaidMember.evidence, atExpiry)).duplicate, true);
  equal((await db.collection("refundCases").where("tournamentId", "==", expired.id).get()).size, 2, "Each original payer has one canonical review case");
  equal((await db.collection("tournaments").doc(expired.id).get()).data().participantCount, 0);
  await Promise.all([expireTournamentTeamAttempt(db, expCaptain.teamAttemptId, atExpiry), expireTournamentTeamAttempt(db, expCaptain.teamAttemptId, atExpiry)]);
  equal((await db.collection("refundCases").where("tournamentId", "==", expired.id).get()).size, 2, "Repeated concurrent expiry cannot create duplicate return cases");
  equal((await db.collection("tournamentFinancialLedger").where("tournamentId", "==", expired.id).where("status", "==", "confirmed_entry_fee").get()).size, 0, "An expired partial team cannot create accepted entry revenue");
  equal((await db.collection("tournamentFinancialLedger").where("tournamentId", "==", expired.id).where("status", "==", "refund_review_required").get()).size, 1, "The earlier successful member payment remains traceable in reconciliation");
  const restricted = await fixture("member_restricted");
  console.log("Member payment regression: account restriction rechecked at confirmation");
  const restrictedTeam = restricted.teams[0];
  const restrictedCaptain = await checkout(restricted, restrictedTeam, restrictedTeam.memberIds[0]);
  const restrictedMember = await checkout(restricted, restrictedTeam, restrictedTeam.memberIds[1]);
  const restrictedPaidCaptain = completion(restrictedCaptain), restrictedPaidMember = completion(restrictedMember);
  await confirmTournamentEntryPayment(db, restrictedPaidCaptain.session, restrictedPaidCaptain.evidence);
  await db.collection("users").doc(restrictedTeam.memberIds[1]).update({ suspended: true });
  equal((await confirmTournamentEntryPayment(db, restrictedPaidMember.session, restrictedPaidMember.evidence)).status, "refund_review_required", "Account eligibility is rechecked at confirmation");
  equal((await db.collection("tournaments").doc(restricted.id).get()).data().participantCount, 0);
  const bad = { ...paidMember.evidence, charge: { ...paidMember.evidence.charge, payment_intent: "pi_unrelated" } };
  await assert.rejects(confirmTournamentEntryPayment(db, paidMember.session, bad), /references do not match/); assertions++;
  console.log(`Tournament member payments: ${assertions} assertions passed with actual Firestore transactions and deterministic Stripe fixtures; live Stripe unverified.`);
} finally {
  const writer = db.bulkWriter();
  for (const id of ids) {
    for (const collection of ["tournamentTeams", "tournamentTeamMemberships", "tournamentTeamRegistrationAttempts", "tournamentEntryPayments", "tournamentEntryReservations", "tournamentFinancialLedger", "tournamentJobs", "tournamentAuditEvents", "refundCases"]) {
      const rows = await db.collection(collection).where("tournamentId", "==", id).get(); rows.docs.forEach(doc => writer.delete(doc.ref));
    }
    writer.delete(db.collection("tournaments").doc(id));
  }
  users.forEach(id => writer.delete(db.collection("users").doc(id)));
  await writer.close(); await app.delete();
}
