import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `dedicated_${randomUUID()}`;
const refs = [];
let uid;
const { GET } = await import("../app/api/challenge-discovery/route.ts");
try {
  const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${prefix}@example.test`, password: "TestPassword123!", returnSecureToken: true }),
  });
  const identity = await signup.json();
  assert.equal(signup.ok, true);
  uid = identity.localId;
  await db.collection("users").doc(uid).set({ role: "host", accountStatus: "active" });
  const request = (query, token = identity.idToken) => new Request(`http://localhost/api/challenge-discovery?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  assert.equal((await GET(request("type=private", null))).status, 401);
  assert.equal((await GET(request("type=private"))).status, 403, "unverified accounts cannot access discovery");
  await getAuth(app).updateUser(uid, { emailVerified: true });
  const refreshed = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${prefix}@example.test`, password: "TestPassword123!", returnSecureToken: true }),
  });
  const verifiedIdentity = await refreshed.json();
  assert.equal(refreshed.ok, true);
  identity.idToken = verifiedIdentity.idToken;
  assert.equal((await GET(request("type=private&page=2"))).status, 400);
  for (const kind of ["private", "live", "tournament"]) {
    const expected = new Set();
    for (let index = 0; index < 82; index += 1) {
      const id = `${prefix}_${kind}_${String(index).padStart(3, "0")}`;
      const document = db.collection("challenges").doc(id);
      refs.push(document);
      // A full first scan page is hidden to exercise an empty continuation page.
      const visible = index >= 36 && index < 80;
      if (visible) expected.add(id);
      await document.set({
        title: id, creatorId: uid, status: index === 81 ? "draft" : "active",
        challengeType: kind === "live" ? "live_event" : kind,
        ...(kind === "live" ? { isLiveEvent: true } : {}),
        visibility: kind === "private" ? "private" : "public", publicVisibility: visible,
        publicPreviewEnabled: true, privateAccessMethod: "direct_invitations", privateAccessCode: "never-serialize",
      });
    }
    const found = new Set();
    let cursor = "";
    let page = 1;
    do {
      const response = await GET(request(`type=${kind}&page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
      assert.equal(response.status, 200);
      const payload = (await response.json()).data;
      assert.equal(payload.total, null);
      assert.ok(payload.challenges.length <= 36);
      for (const item of payload.challenges) {
        if (!item.id.startsWith(prefix)) continue;
        assert.ok(!found.has(item.id), "alias queries must not duplicate records across pages");
        assert.ok(expected.has(item.id), "hidden and draft challenges stay hidden");
        assert.equal(item.privateAccessCode, undefined);
        if (kind === "private") assert.equal(item.accessMethod, "direct_invitations");
        found.add(item.id);
      }
      assert.ok(!payload.hasMore || payload.nextCursor);
      cursor = payload.nextCursor ?? "";
      page += 1;
      assert.ok(page < 50, "bounded cursor traversal terminates");
    } while (cursor);
    assert.deepEqual([...found].sort(), [...expected].sort());
  }
  console.log("PASS dedicated Private/Live/Tournament cursor discovery: bounded pages, sparse-page continuation, alias deduplication, hidden/draft exclusion, authentication, and credential redaction");
} finally {
  await Promise.all(refs.map((ref) => ref.delete()));
  if (uid) { await db.collection("users").doc(uid).delete(); await getAuth(app).deleteUser(uid); }
  await deleteApp(app);
}
