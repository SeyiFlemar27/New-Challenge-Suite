import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const { GET, POST } = await import("../app/api/tournaments/[id]/teams/route.ts");
const runId = `team_privacy_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function check(value, message) { assert.ok(value, message); assertions += 1; }

async function createAuthUser(label) {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ email, emailVerified: true, role: "user", accountStatus: "active" });
  await db.collection("profiles").doc(body.localId).set({ email, username: label, usernameNormalized: label.toLowerCase(), displayName: label, profileVisibility: "public" });
  return { uid: body.localId, token: body.idToken };
}

function request(url, token, method = "GET", body) {
  return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

try {
  const captain = await createAuthUser("captain");
  const other = await createAuthUser("other_captain");
  const tournamentId = `${runId}_tournament`;
  const otherTournamentId = `${runId}_other_tournament`;
  const teamId = `${runId}_team`;
  const otherTeamId = `${runId}_other_team`;
  const tournament = { id: tournamentId, status: "registration_open", participationMode: "team", entryType: "free", teamConfig: { joiningMode: "invite_and_requests", maximumSize: 20 } };
  await Promise.all([
    db.collection("tournaments").doc(tournamentId).set(tournament),
    db.collection("tournaments").doc(otherTournamentId).set({ ...tournament, id: otherTournamentId }),
    db.collection("tournamentTeams").doc(teamId).set({ id: teamId, tournamentId, captainUserId: captain.uid, memberUserIds: [captain.uid], rosterLockedAt: null }),
    db.collection("tournamentTeams").doc(otherTeamId).set({ id: otherTeamId, tournamentId: otherTournamentId, captainUserId: captain.uid, memberUserIds: [captain.uid], rosterLockedAt: null }),
    db.collection("tournamentTeamMemberships").doc(`${tournamentId}_${captain.uid}`).set({ id: `${tournamentId}_${captain.uid}`, tournamentId, teamId, userId: captain.uid, role: "captain", status: "active" })
  ]);

  const profiles = [];
  const accounts = [];
  for (let i = 0; i < 275; i += 1) {
    const id = `${runId}_candidate_${String(i).padStart(3, "0")}`;
    const username = `fan${String(i).padStart(3, "0")}`;
    profiles.push({ ref: db.collection("profiles").doc(id), data: { email: `${username}@private.test`, username, usernameNormalized: username, displayName: `Display ${i}`, profileVisibility: i === 260 ? "private" : "public", publicProfileHidden: i === 261, privatePhoneNumber: "+15550000000" } });
    const ineligible = i === 262 || i === 263;
    accounts.push({ ref: db.collection("users").doc(id), data: { email: `${username}@private.test`, role: i === 262 ? "sponsor" : "user", accountStatus: i === 263 ? "suspended" : "active", suspended: false, emailVerified: true } });
    if (i === 264) accounts.at(-1).data.role = "enterprise";
    if (i === 265) await db.collection("tournamentTeamMemberships").doc(`${tournamentId}_${id}`).set({ id: `${tournamentId}_${id}`, tournamentId, teamId: `${runId}_existing_team`, userId: id, status: "active" });
    void ineligible;
  }
  const batchWrites = [...profiles, ...accounts];
  for (let offset = 0; offset < batchWrites.length; offset += 450) {
    const batch = db.batch();
    for (const write of batchWrites.slice(offset, offset + 450)) batch.set(write.ref, write.data);
    await batch.commit();
  }
  const privateRosterMemberId = `${runId}_private_roster_member`;
  await Promise.all([
    db.collection("profiles").doc(privateRosterMemberId).set({ email: "hidden@example.test", username: "hiddenmember", usernameNormalized: "hiddenmember", displayName: "Hidden Member", profileVisibility: "private", privatePhoneNumber: "+15550000000" }),
    db.collection("users").doc(privateRosterMemberId).set({ email: "hidden@example.test", displayName: "Hidden Member", accountStatus: "active", role: "user" }),
    db.collection("tournamentTeams").doc(teamId).set({ memberUserIds: [captain.uid, privateRosterMemberId] }, { merge: true }),
    db.collection("tournamentTeamMemberships").doc(`${tournamentId}_${privateRosterMemberId}`).set({ id: `${tournamentId}_${privateRosterMemberId}`, tournamentId, teamId, userId: privateRosterMemberId, status: "active" })
  ]);

  const context = { params: Promise.resolve({ id: tournamentId }) };
  equal((await GET(request(`http://localhost/api/tournaments/${tournamentId}/teams?q=fan&teamId=${teamId}`, null), context)).status, 401, "unauthenticated discovery is denied");
  equal((await GET(request(`http://localhost/api/tournaments/${tournamentId}/teams?q=fan&teamId=${teamId}`, other.token), context)).status, 403, "non-captain cannot discover team members");
  equal((await GET(request(`http://localhost/api/tournaments/${tournamentId}/teams?q=fan&teamId=${otherTeamId}`, captain.token), context)).status, 403, "a team from another Tournament cannot be used for discovery");
  const teamBundleResponse = await GET(request(`http://localhost/api/tournaments/${tournamentId}/teams`, captain.token), context);
  equal(teamBundleResponse.status, 200, "captain can load their Tournament team bundle");
  const teamBundle = (await teamBundleResponse.json()).data;
  equal(teamBundle.identities[privateRosterMemberId].displayName, "Private profile", "team bundle redacts private roster identity from the captain");
  equal(teamBundle.identities[privateRosterMemberId].username, "", "team bundle does not reveal a private username");
  check(!Object.hasOwn(teamBundle.identities[privateRosterMemberId], "email"), "team bundle excludes a private roster member's email");

  let cursor = "";
  const foundIds = new Set();
  let pages = 0;
  let privatePhoneLeak = false;
  do {
    const url = new URL(`http://localhost/api/tournaments/${tournamentId}/teams`);
    url.searchParams.set("q", "fan");
    url.searchParams.set("teamId", teamId);
    url.searchParams.set("limit", "12");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await GET(request(url.toString(), captain.token), context);
    equal(response.status, 200, `captain can fetch eligible profile page ${pages + 1}`);
    const payload = (await response.json()).data;
    pages += 1;
    for (const member of payload.members) {
      check(!foundIds.has(member.id), "cursor pagination returns no duplicate member");
      foundIds.add(member.id);
      check(Object.keys(member).sort().join(",") === "displayName,id,username", "discovery returns only approved identity fields");
      if (Object.hasOwn(member, "privatePhoneNumber")) privatePhoneLeak = true;
    }
    cursor = payload.nextCursor ?? "";
    if (pages > 40) throw new Error("Team-member search did not terminate.");
  } while (cursor);
  console.log(`Team discovery scanned ${pages} pages and returned ${foundIds.size} unique profiles.`);
  check(pages > 1, "large search result is cursor paginated");
  check(foundIds.has(`${runId}_candidate_270`), "eligible users after the former 250-record sample are discoverable");
  check(!foundIds.has(`${runId}_candidate_260`), "private profiles are excluded");
  check(!foundIds.has(`${runId}_candidate_261`), "hidden profiles are excluded");
  check(!foundIds.has(`${runId}_candidate_262`), "Sponsor accounts are not Tournament candidates");
  check(!foundIds.has(`${runId}_candidate_263`), "suspended accounts are excluded");
  check(!foundIds.has(`${runId}_candidate_264`), "Enterprise accounts are not Tournament candidates");
  check(!foundIds.has(`${runId}_candidate_265`), "users already on a Tournament team are excluded");
  equal(privatePhoneLeak, false, "private profile fields never appear in search responses");

  const privateTarget = `${runId}_candidate_260`;
  const publicTarget = `${runId}_candidate_270`;
  equal((await POST(request(`http://localhost/api/tournaments/${tournamentId}/teams`, captain.token, "POST", { action: "invite", teamId, userId: privateTarget }), context)).status, 404, "captain cannot invite an undiscoverable private profile");
  const inviteResponse = await POST(request(`http://localhost/api/tournaments/${tournamentId}/teams`, captain.token, "POST", { action: "invite", teamId, userId: publicTarget }), context);
  equal(inviteResponse.status, 200, "captain can invite an eligible public profile");
  const invite = (await db.collection("tournamentTeamInvitations").doc(`${teamId}_${publicTarget}`).get()).data();
  equal(invite?.inviteeUserId, publicTarget, "invitation is bound to the selected public user");
  equal((await POST(request(`http://localhost/api/tournaments/${tournamentId}/teams`, other.token, "POST", { action: "invite", teamId, userId: publicTarget }), context)).status, 403, "unrelated user cannot invite to another captain's team");

  console.log(`PASS actual Tournament team discovery and invitation handlers against Firebase Auth/Firestore Emulator: ${assertions} assertions across ${pages} cursor pages.`);
} finally {
  await db.terminate();
  await app.delete();
}
