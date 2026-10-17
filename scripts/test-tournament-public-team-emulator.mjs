import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getPublicTournamentTeam } from "../lib/server/tournament-public-team.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app), id = `roster_${randomUUID()}`, teamId = `${id}_team`, captain = `${id}_captain`, privateMember = `${id}_member`;
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
try {
  await db.collection("tournaments").doc(id).set({ privacy: "public", participationMode: "team", status: "registration_open" });
  await db.collection("tournamentTeams").doc(teamId).set({ tournamentId: id, name: "North Stars", status: "ready", memberUserIds: [captain, privateMember], captainUserId: captain, privatePaymentReference: "PRIVATE_ROSTER_SENTINEL" });
  // Reserved .invalid domain: no deliverable address and no QA-profile marker.
  // Explicit QA identities are intentionally excluded from public directories.
  for (const userId of [captain, privateMember]) await db.collection("users").doc(userId).set({ accountStatus: "active", email: "hidden@participants.invalid" });
  await db.collection("profiles").doc(captain).set({ displayName: "Alex Rivera", username: "alex-rivera", publicProfile: true });
  await db.collection("profiles").doc(privateMember).set({ displayName: "PRIVATE_MEMBER_NAME", username: "private-member", profileVisibility: "private" });
  const result = await getPublicTournamentTeam(db, id, "entrant-1");
  equal(result.name, "North Stars"); equal(result.memberCount, 2); equal(result.publicMembers.length, 1); equal(result.publicMembers[0].captain, true);
  equal(result.publicMembers[0].profilePath, "/profile/alex-rivera");
  const forming = db.batch();
  for (let index = 0; index < 151; index++) forming.set(db.collection("tournamentTeams").doc(`aaa_${id}_${index}`), { tournamentId: id, status: "forming", name: "Not registered" });
  await forming.commit();
  equal((await getPublicTournamentTeam(db, id, "entrant-1")).name, "North Stars");
  assert(!JSON.stringify(result).includes(captain) && !JSON.stringify(result).includes("PRIVATE_") && !JSON.stringify(result).includes("hidden@participants.invalid")); assertions++;
  await db.collection("profiles").doc(captain).update({ publicProfile: false });
  equal((await getPublicTournamentTeam(db, id, "entrant-1")).publicMembers.length, 0);
  await db.collection("tournaments").doc(id).update({ privacy: "private" });
  equal(await getPublicTournamentTeam(db, id, "entrant-1"), null);
  await db.collection("tournaments").doc(id).update({ privacy: "public", status: "draft" });
  equal(await getPublicTournamentTeam(db, id, "entrant-1"), null);
  await db.collection("tournaments").doc(id).update({ status: "registration_open" });
  await db.collection("tournamentTeams").doc(teamId).update({ status: "forming" });
  equal(await getPublicTournamentTeam(db, id, "entrant-1"), null);
  equal(await getPublicTournamentTeam(db, id, "entrant-999"), null);
  console.log(`Tournament public team projection: ${assertions} Firestore assertions passed, including private profiles, hidden payment references and unpublished teams.`);
} finally {
  await db.collection("tournaments").doc(id).delete();
  const teams = await db.collection("tournamentTeams").where("tournamentId", "==", id).get();
  const cleanup = db.batch(); for (const doc of teams.docs) cleanup.delete(doc.ref); await cleanup.commit();
  for (const userId of [captain, privateMember]) { await db.collection("users").doc(userId).delete(); await db.collection("profiles").doc(userId).delete(); }
  await db.terminate();
}
