import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { reconcileTournamentTeamEntitlements } from "../lib/server/tournament-team-entitlements.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }), db = getFirestore(app);
const prefix = `entitlement_${randomUUID()}`;
let assertions = 0;
const eq = (a, b) => { assert.deepEqual(a, b); assertions++; };
async function fixture(label) {
  const id = `${prefix}_${label}`, teamId = `${id}_team`, settlementId = `${id}_settlement`;
  const users = [0, 1, 2, 3].map(index => `${id}_${index}`);
  await db.collection("tournaments").doc(id).set({ participationMode: "team", settlementId, status: "winners_announced" });
  await db.collection("challengeSettlements").doc(settlementId).set({ settlementEntityType: "tournament" });
  await db.collection("tournamentTeams").doc(teamId).set({ tournamentId: id, memberUserIds: users, rosterLockedAt: "2026-10-10T12:00:00Z" });
  for (const [index, userId] of users.entries()) {
    const amount = index === 0 ? 1001 : 1000;
    await db.collection("cashLedger").doc(`${id}_${index}`).set({ challengeId: id, settlementId, teamId, userId, sourceType: "challenge_winner_prize", placement: 1, direction: "credit", status: "pending_review", balanceBucket: "pending", netAmountCents: amount, amountCents: amount, currency: "USD", createdAt: "2026-10-10T12:00:00Z", holdUntil: "2026-10-13T12:00:00Z" });
    await db.collection("cashWallets").doc(userId).set({ pendingBalanceCents: amount, lockedBalanceCents: 0, lifetimeEarningsCents: amount });
  }
  return { id, teamId, users, input: { tournamentId: id, teamId, userId: users[0], decision: "permanently_ineligible", adminId: "local_admin", reason: "Verified permanent eligibility determination", evidenceReference: "supportCase/verified-local-evidence", expectedVersion: 0, idempotencyKey: `${label}-determination-0001` } };
}
try {
  const first = await fixture("permanent");
  const results = await Promise.all([reconcileTournamentTeamEntitlements(db, first.input), reconcileTournamentTeamEntitlements(db, first.input)]);
  eq(results.filter(row => !row.idempotent).length, 1);
  const credits = await db.collection("cashLedger").where("teamId", "==", first.teamId).get();
  eq(credits.docs.map(row => row.data().netAmountCents).sort((a,b) => a-b), [0, 1333, 1334, 1334]);
  eq(credits.docs.reduce((sum,row) => sum + row.data().netAmountCents, 0), 4001);
  eq((await db.collection("cashWallets").doc(first.users[0]).get()).data().pendingBalanceCents, 0);
  eq((await db.collection("tournamentEntitlementRevisions").where("teamId", "==", first.teamId).get()).size, 1);
  await assert.rejects(reconcileTournamentTeamEntitlements(db, { ...first.input, idempotencyKey: "stale-new-key-0001" }), /VERSION_STALE/); assertions++;
  await reconcileTournamentTeamEntitlements(db, { ...first.input, decision: "eligible", expectedVersion: 1, idempotencyKey: "corrected-determination-0002" });
  eq((await db.collection("cashLedger").doc(`${first.id}_0`).get()).data().netAmountCents, 1001);
  eq((await db.collection("cashWallets").doc(first.users[0]).get()).data().pendingBalanceCents, 1001);
  const temp = await fixture("temporary");
  await reconcileTournamentTeamEntitlements(db, { ...temp.input, decision: "temporary_hold" });
  eq((await db.collection("cashLedger").doc(`${temp.id}_0`).get()).data().netAmountCents, 1001);
  eq((await db.collection("cashLedger").doc(`${temp.id}_0`).get()).data().status, "pending_hold");
  eq((await db.collection("cashWallets").doc(temp.users[0]).get()).data().lockedBalanceCents, 1001);
  eq((await db.collection("cashLedger").doc(`${temp.id}_1`).get()).data().netAmountCents, 1000);
  const paid = await fixture("paid");
  const paidRef = db.collection("cashLedger").doc(`${paid.id}_1`);
  await paidRef.update({ status: "paid", externalPayoutExecuted: true, providerTransferId: "provider_fixture_completed" });
  const paidBefore = (await paidRef.get()).data();
  eq((await reconcileTournamentTeamEntitlements(db, paid.input)).status, "recovery_review_required");
  eq((await paidRef.get()).data(), paidBefore);
  eq((await db.collection("cashLedger").doc(`${paid.id}_0`).get()).data().netAmountCents, 1001);
  eq((await db.collection("cashLedger").doc(`${paid.id}_0`).get()).data().teamEligibilityRestricted, true);
  const none = await fixture("none");
  for (const [index, userId] of none.users.entries()) await reconcileTournamentTeamEntitlements(db, { ...none.input, userId, expectedVersion: index, idempotencyKey: `none-eligible-${index}-decision` });
  eq((await db.collection("tournamentTeams").doc(none.teamId).get()).data().entitlementStatus, "no_eligible_recipients_hold");
  eq((await db.collection("tournamentSettlementHolds").where("teamId", "==", none.teamId).get()).size, 1);
  const restricted = await fixture("restricted");
  await db.collection("cashLedger").doc(`${restricted.id}_1`).update({ disputeRestricted: true, financialRestriction: "stripe_dispute" });
  eq((await reconcileTournamentTeamEntitlements(db, restricted.input)).status, "recovery_review_required");
  eq((await db.collection("cashLedger").doc(`${restricted.id}_1`).get()).data().financialRestriction, "stripe_dispute");
  await assert.rejects(reconcileTournamentTeamEntitlements(db, { ...restricted.input, evidenceReference: "" }), /EVIDENCE_REQUIRED/); assertions++;
  const { POST: adminAction } = await import("../app/api/admin/tournaments/[id]/route.ts");
  async function identity(isAdmin) {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: "EmulatorOnly123!", returnSecureToken: true }) });
    const user = await response.json();
    await db.collection("users").doc(user.localId).set({ role: isAdmin ? "admin" : "creator", isAdmin, emailVerified: true });
    return user.idToken;
  }
  const adminToken = await identity(true), memberToken = await identity(false);
  const context = { params: Promise.resolve({ id: first.id }) };
  const body = { action: "reconcile_team_entitlements", teamId: first.teamId, userId: first.users[0], decision: "temporary_hold", reason: "Verified new temporary eligibility review", evidenceReference: "supportCase/temporary-local-review", confirmed: true, expectedVersion: 2, idempotencyKey: "authorized-handler-decision-0003" };
  const request = (token, input = body) => new Request("http://localhost/api/local-test", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input) });
  eq((await adminAction(request(null), context)).status, 401);
  eq((await adminAction(request(memberToken), context)).status, 403);
  eq((await adminAction(request(adminToken, { ...body, confirmed: false }), context)).status, 422);
  eq((await adminAction(request(adminToken), context)).status, 200);
  eq((await adminAction(request(adminToken), context)).status, 200);
  eq((await db.collection("tournamentTeams").doc(first.teamId).get()).data().entitlementVersion, 3);
  console.log(`Team entitlement revisions: ${assertions} transactional emulator assertions passed; completed payouts preserved; no provider operation.`);
} finally { await app.delete(); }
