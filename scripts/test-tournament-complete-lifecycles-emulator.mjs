import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";
import { processTournamentActivationJobById } from "../lib/server/tournament-activation.ts";
import { processTournamentLifecycleAction } from "../lib/server/tournament-lifecycle-scheduler.ts";
import { createPendingCreatorPrizeFunding, confirmCreatorPrizeFunding } from "../lib/server/prize-funding.ts";
import { createTournamentEntryCheckout, confirmTournamentEntryPayment } from "../lib/server/tournament-paid-entry.ts";
import { setTournamentRegistrationReadinessForTests } from "../lib/server/tournament-publication.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/);
setTournamentRegistrationReadinessForTests(true);
process.env.FIREBASE_STORAGE_BUCKET = `${process.env.GCLOUD_PROJECT}.appspot.com`;
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT, storageBucket: process.env.FIREBASE_STORAGE_BUCKET }), db = getFirestore(app), bucket = getStorage(app).bucket();
const { POST: create } = await import("../app/api/tournaments/route.ts");
const { PATCH: edit } = await import("../app/api/tournaments/[id]/route.ts");
const { POST: adminAction } = await import("../app/api/admin/tournaments/[id]/route.ts");
const { POST: join } = await import("../app/api/tournaments/[id]/join/route.ts");
const { POST: teamAction } = await import("../app/api/tournaments/[id]/teams/route.ts");
const { POST: submit } = await import("../app/api/tournaments/[id]/submissions/route.ts");
const { POST: vote } = await import("../app/api/tournaments/[id]/votes/route.ts");
const { POST: result } = await import("../app/api/tournaments/[id]/results/route.ts");
const { POST: manage } = await import("../app/api/tournaments/[id]/manage/actions/route.ts");
let assertions = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
const context = id => ({ params: Promise.resolve({ id }) });
function request(user, body, method = "POST") { return new Request("http://localhost/api/local-test", { method, headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function call(handler, user, body, id, method) {
  const response = await handler(request(user, body, method), context(id));
  const json = await response.json();
  assert.equal(response.ok && json.ok, true, `${handler.name}: HTTP ${response.status} ${json.code ?? ""} ${json.message ?? ""}`); assertions++;
  return json.data;
}
async function user(label, admin = false) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${label}-${randomUUID()}@example.test`, password: "EmulatorOnly123!", returnSecureToken: true }) });
  const record = await response.json(); assert.ok(record.idToken);
  await db.collection("users").doc(record.localId).set({ displayName: `Local ${label}`, role: admin ? "admin" : "creator", isAdmin: admin, emailVerified: true, accountStatus: "active", planId: "creator", planStatus: "active" });
  return { uid: record.localId, token: record.idToken };
}
const host = await user("host"), admin = await user("admin", true), voter = await user("voter");
const sessions = new Map();
const stripe = { checkout: { sessions: { create: async (params, options) => {
  if (sessions.has(options.idempotencyKey)) return sessions.get(options.idempotencyKey);
  const session = { ...params, id: `cs_lifecycle_${sessions.size}`, url: "https://checkout.stripe.test/isolated-fixture", amount_total: params.line_items[0].price_data.unit_amount, currency: "usd", payment_status: "unpaid", payment_intent: `pi_lifecycle_${sessions.size}` };
  sessions.set(options.idempotencyKey, session); return session;
} } } };
async function pay(id, player, target) {
  const checkout = await createTournamentEntryCheckout(db, stripe, { tournamentId: id, target: { ...target, userId: player.uid }, rulesAccepted: true, appUrl: "http://localhost:3000" });
  const session = { ...[...sessions.values()].find(row => row.id === checkout.checkoutSessionId), payment_status: "paid" };
  const charge = { id: `ch_${session.payment_intent}`, payment_intent: session.payment_intent, status: "succeeded", paid: true, captured: true, amount_captured: 500, currency: "usd", payment_method_details: { type: "card" } };
  const evidence = { charge, paymentIntent: { id: session.payment_intent, status: "succeeded", capture_method: "automatic", amount_received: 500, currency: "usd", latest_charge: charge.id } };
  return confirmTournamentEntryPayment(db, session, evidence);
}
await db.collection("doroCoinWallets").doc(voter.uid).set({ balance: 1000 });
try {
  for (const mode of ["individual", "team"]) for (const format of ["single_elimination", "double_elimination"]) {
    const label = `${mode}_${format}`;
    const players = await Promise.all(Array.from({ length: mode === "team" ? 8 : 4 }, (_, index) => user(`${label}_${index}`)));
    const owners = new Map();
    const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "gold" } }).png().toBuffer();
    const coverPath = `tournaments/drafts/${host.uid}/cover/${randomUUID()}.png`;
    await bucket.file(coverPath).save(image, { resumable: false, metadata: { contentType: "image/png" } });
    const mediaUrl = path => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
    const body = { configVersion: 3, title: `Complete ${label}`, category: "Gaming", subcategory: "Console", description: "An isolated complete lifecycle acceptance scenario for approved Tournament rules.", tournamentRules: ["Respect competitors."], participantCapacity: 4, participationMode: mode, format, minimumTeamSize: 2, maximumTeamSize: 2, entryType: "free", basePrizeAmountMinor: 10000, submissionDurationHours: 12, votingDurationHours: 12, coverImagePath: coverPath, coverImageUrl: mediaUrl(coverPath), status: "draft" };
    body.teamJoiningMode = "invite_and_requests";
    const paidEntry = format === "double_elimination";
    if (paidEntry) { body.entryType = "paid_entry_setup_required"; body.entryFeeAmountMinor = 500; }
    const created = await call(create, host, body);
    const id = created.tournament.id;
    const payment = await createPendingCreatorPrizeFunding(db, { challengeId: id, subjectType: "tournament", creatorId: host.uid, amountCents: 10000 });
    await confirmCreatorPrizeFunding(db, { id: `${id}_creator_fixture` }, { id: `${id}_session`, mode: "payment", payment_status: "paid", amount_total: 10000, currency: "usd", payment_intent: `${id}_intent`, metadata: { paymentPurpose: "prize_pool_funding", creatorPrizeFundingId: payment.id, fundingSubjectType: "tournament", challengeId: id, userId: host.uid, initiatedByUserId: host.uid, organizationOwnerId: "" } });
    await call(edit, host, { status: "pending_review", expectedUpdatedAt: (await db.collection("tournaments").doc(id).get()).data().updatedAt }, id, "PATCH");
    eq((await db.collection("tournaments").doc(id).get()).data().status, "registration_open", "automatic publication opens registration with deterministic scheduler readiness; no editorial approval");
    if (paidEntry) await db.collection("tournaments").doc(id).update({ paymentActivationEnabled: true }); // Isolated provider-fixture environment only.
    if (mode === "individual") {
      for (const player of players) { if (paidEntry) await pay(id, player, { mode: "individual", participantId: `${id}_${player.uid}` }); else await call(join, player, { rulesAccepted: true }, id); owners.set(`${id}_${player.uid}`, player); }
    } else {
      for (let index = 0; index < 4; index++) {
        const captain = players[index * 2], member = players[index * 2 + 1];
        const team = await call(teamAction, captain, { action: "create", name: `Acceptance Team ${index}` }, id);
        await call(teamAction, member, { action: "request_join", teamId: team.teamId, message: "Please accept my membership." }, id);
        await call(teamAction, captain, { action: "accept_request", teamId: team.teamId, userId: member.uid }, id);
        if (paidEntry) {
          eq((await pay(id, captain, { mode: "team", teamId: team.teamId })).status, "member_confirmed");
          eq((await db.collection("tournamentTeams").doc(team.teamId).get()).data().slotReservedAt ?? null, null, "captain payment alone does not register the team");
          await pay(id, member, { mode: "team", teamId: team.teamId });
        } else await call(teamAction, captain, { action: "ready", teamId: team.teamId, rulesAccepted: true }, id);
        owners.set(team.teamId, captain);
      }
    }
    const tournamentRef = db.collection("tournaments").doc(id);
    const registered = (await tournamentRef.get()).data();
    eq(registered.participantCount, 4);
    const jobId = `${id}_activation_v${registered.activationVersion}`;
    eq((await processTournamentActivationJobById(db, jobId, registered.activationVersion, new Date(Date.parse(registered.activationWindowEndsAt) - 1))).code, "ACTIVATION_WINDOW_OPEN");
    const activationWait = Math.max(0, Date.parse(registered.activationWindowEndsAt) - Date.now());
    assert.ok(activationWait <= 5000, "activation wait must be the persisted five-second window");
    while (Date.now() < Date.parse(registered.activationWindowEndsAt)) await new Promise(resolve => setTimeout(resolve, Math.max(1, Date.parse(registered.activationWindowEndsAt) - Date.now())));
    eq((await processTournamentActivationJobById(db, jobId, registered.activationVersion, new Date())).status, "activated");
    // Test-only deadline advancement: assert real durations first, then advance
    // persisted fixture deadlines. No production clock, endpoint or rule bypass.
    let processed = 0, resetSeen = false;
    for (let iteration = 0; iteration < 20; iteration++) {
      const matches = await db.collection("tournamentMatches").where("tournamentId", "==", id).get();
      const open = matches.docs.filter(row => row.data().status === "submissions_open" && row.data().participantAId && row.data().participantBId);
      if (!open.length) break;
      for (const row of open) {
        const match = { id: row.id, ...row.data() };
        eq(Date.parse(match.submissionDeadlineAt) - Date.parse(match.submissionsOpenedAt), 12 * 60 * 60_000);
        if (processed === 0) {
          const original = new Date(Date.now() - 1).toISOString();
          await row.ref.update({ submissionDeadlineAt: original });
          await processTournamentLifecycleAction({ db, id, tournament: { id, ...(await tournamentRef.get()).data() }, action: "process_match_deadlines", actorId: "system_tournament_lifecycle" });
          const extended = (await row.ref.get()).data();
          eq(extended.noSubmissionExtensionUsed, true);
          eq(Date.parse(extended.submissionDeadlineAt) - Date.parse(original), 12 * 60 * 60_000);
          eq(extended.status, "submissions_open");
        }
        for (const [side, participantId] of [["a", match.participantAId], ["b", match.participantBId]]) {
          const player = owners.get(participantId), path = `tournaments/${id}/rounds/${match.roundId}/matches/${match.id}/participants/${participantId}/images/${side}.png`;
          const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: processed * 2 + (side === "a" ? 1 : 2), g: 80, b: 90 } } }).png().toBuffer();
          await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType: "image/png" } });
          let saved = await call(submit, player, { matchId: match.id, roundId: match.roundId, mediaPath: path, mediaUrl: mediaUrl(path), mediaType: "image" }, id);
          if (processed === 0 && side === "a") {
            if (mode === "team") {
              const ordinary = players[players.findIndex(person => person.uid === player.uid) + 1];
              eq((await submit(request(ordinary, { matchId: match.id, roundId: match.roundId, mediaPath: path, mediaUrl: mediaUrl(path), mediaType: "image", expectedRevision: 1 }), context(id))).status, 403, "ordinary member cannot replace captain submission");
            }
            const replacementPath = path.replace("/a.png", "/replacement.png");
            await bucket.file(replacementPath).save(await sharp({ create: { width: 8, height: 8, channels: 3, background: "purple" } }).png().toBuffer(), { resumable: false, metadata: { contentType: "image/png" } });
            saved = await call(submit, player, { matchId: match.id, roundId: match.roundId, mediaPath: replacementPath, mediaUrl: mediaUrl(replacementPath), mediaType: "image", expectedRevision: 1 }, id);
            eq(saved.submission.revision, 2);
            eq((await db.collection("tournamentSubmissionRevisions").doc(`${saved.submission.id}_revision_1`).get()).exists, true);
          }
          await call(adminAction, admin, { action: "submission_approved", submissionId: saved.submission.id, confirmed: true, reason: "Verified acceptable isolated match media" }, id);
        }
        const target = { matchId: match.id, selectedParticipantId: match.participantAId, submissionId: `${id}_${match.id}_${match.participantAId}` };
        eq((await vote(request(voter, { ...target, voteType: "free" }), context(id))).ok, false, "no early voting");
        await row.ref.update({ submissionsOpenedAt: new Date(Date.now() - 12 * 60 * 60_000 - 1000).toISOString(), submissionDeadlineAt: new Date(Date.now() - 1).toISOString() });
        const current = (await tournamentRef.get()).data();
        await processTournamentLifecycleAction({ db, id, tournament: { id, ...current }, action: "process_match_deadlines", actorId: "system_tournament_lifecycle" });
        const voting = (await row.ref.get()).data();
        eq(voting.status, "voting_open");
        eq(Date.parse(voting.votingClosesAt) - Date.parse(voting.votingOpenedAt), 12 * 60 * 60_000);
        // Force the undefeated finalist to lose once, exercising the DE reset.
        const selected = format === "double_elimination" && match.bracket === "grand_final" && match.resetMatchId ? match.participantBId : match.participantAId;
        const voted = { ...target, selectedParticipantId: selected, submissionId: `${id}_${match.id}_${selected}` };
        await call(vote, voter, { ...voted, voteType: "free" }, id);
        const opposite = selected === match.participantAId ? match.participantBId : match.participantAId;
        await call(vote, voter, { ...voted, selectedParticipantId: opposite, submissionId: `${id}_${match.id}_${opposite}`, voteType: "dorocoin", confirmedDoroCoinSpend: true, idempotencyKey: `${id}_${match.id}_paid` }, id);
        await row.ref.update({ votingClosesAt: new Date(Date.now() - 1).toISOString() });
        await processTournamentLifecycleAction({ db, id, tournament: { id, ...(await tournamentRef.get()).data() }, action: "process_match_deadlines", actorId: "system_tournament_lifecycle" });
        const confirmed = await call(result, host, { matchId: match.id }, id);
        eq(confirmed.voteOutcome.tied, true, "tied result uses complete authoritative vote sequence");
        eq((await row.ref.get()).data().winnerParticipantId, selected);
        if (confirmed.grandFinalResetRequired) resetSeen = true;
        eq((await row.ref.get()).data().status, "confirmed");
        processed++;
      }
    }
    const placements = await db.collection("tournamentPlacements").where("tournamentId", "==", id).get();
    eq(placements.size, 3, `${label}: three real placements`);
    if (format === "double_elimination") eq(resetSeen, true, "Grand Final reset executed");
    await call(manage, host, { action: "review_final_placements", confirmed: true, reason: "Reviewed the actual competition placements" }, id);
    await call(adminAction, admin, { action: "approve_payout_foundation", confirmed: true, reason: "Verified final placements and confirmed funding" }, id);
    eq((await tournamentRef.get()).data().status, "winners_announced");
    const ledger = await db.collection("cashLedger").where("challengeId", "==", id).get();
    eq(ledger.docs.filter(row => row.data().sourceType === "challenge_winner_prize").reduce((sum, row) => sum + row.data().netAmountCents, 0), 10000 + (paidEntry ? players.length * 500 * 0.65 : 0), "creator funds remain entirely in the winner pool; only entry revenue uses 65/20/15");
    eq(ledger.docs.some(row => row.data().externalPayoutExecuted === true), false);
    console.log(`PASS complete backend lifecycle ${label}: ${processed} verified matches, three placements and internal settlement; ${paidEntry ? "paid-entry" : "free-entry"} scenario with deterministic provider fixtures.`);
  }
  console.log(`Tournament four lifecycle scenarios: ${assertions} actual-handler/service assertions passed. Test-controlled deadlines; no live Stripe or external payout.`);
} finally { await app.delete(); }
