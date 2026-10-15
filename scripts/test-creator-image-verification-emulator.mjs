import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

const projectId = process.env.GCLOUD_PROJECT;
assert.ok(projectId?.startsWith("demo-") && process.env.FIREBASE_STORAGE_EMULATOR_HOST?.startsWith("127.0.0.1:"));
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const { POST } = await import("../app/api/creator-media/verify/route.ts");
const { verifyChallengeMedia } = await import("../lib/server/media-verification.ts");
let assertions = 0;
function equal(a, b, message) { assert.deepEqual(a, b, message); assertions++; }
try {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: "TestPassword123!", returnSecureToken: true }) });
  const user = await response.json();
  assert.ok(user.localId);
  await db.collection("users").doc(user.localId).set({ email: user.email, emailVerified: true, role: "creator", accountStatus: "active" });
  const request = (path) => new Request("http://localhost/api/creator-media/verify", { method: "POST", headers: { authorization: `Bearer ${user.idToken}`, "content-type": "application/json" }, body: JSON.stringify({ path }) });
  const bytes = await sharp({ create: { width: 2, height: 1, channels: 3, background: "#123" } }).png().withMetadata({ density: 300 }).toBuffer();
  for (const folder of ["challenges/drafts", "challenges/host-drafts", "challenges/hybrid-drafts", "tournaments/drafts"]) {
    const path = `${folder}/${user.localId}/${folder.startsWith("tournaments") ? "cover" : "banner"}/${randomUUID()}.png`;
    await bucket.file(path).save(bytes, { contentType: "image/png" });
    const result = await POST(request(path));
    equal(result.status, 200, `actual byte verification accepts arbitrary aspect ratio/DPI in ${folder}`);
    equal((await result.json()).data.status, "verified", "no fabricated completion status");
  }
  const path = `challenges/drafts/${user.localId}/banner/${randomUUID()}.png`;
  await bucket.file(path).save(Buffer.concat([bytes, Buffer.alloc(10 * 1024 * 1024 - bytes.length)]), { contentType: "image/png" });
  equal((await POST(request(path))).status, 200, "10 MB inclusive server byte validation");
  await bucket.file(path).save(Buffer.alloc(10 * 1024 * 1024 + 1), { contentType: "image/png" });
  equal((await POST(request(path))).status, 422, "over 10 MB rejected");
  await bucket.file(path).save(Buffer.from("not an image"), { contentType: "image/png" });
  equal((await POST(request(path))).status, 422, "fake image headers rejected");
  await bucket.file(path).save(bytes, { contentType: "image/jpeg" });
  equal((await POST(request(path))).status, 422, "declared MIME must match decoded format");
  equal((await POST(request(`challenges/drafts/other/banner/test.png`))).status, 403, "foreign owner rejected before download");
  equal((await POST(new Request("http://localhost/api/creator-media/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }))).status, 401, "authentication required");
  await assert.rejects(() => verifyChallengeMedia(db, "missing", { mediaUploadStatus: "storage_disabled", usesPlaceholderMedia: true }, user.localId), /MEDIA_REQUIRED/); assertions++;
  console.log(`PASS creator-image actual-handler verification: ${assertions} assertions`);
} finally { await db.terminate(); await app.delete(); }
