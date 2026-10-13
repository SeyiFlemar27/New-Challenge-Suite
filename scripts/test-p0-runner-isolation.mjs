import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const base = {
  ...process.env,
  GCLOUD_PROJECT: "demo-challenge-suite",
  GOOGLE_CLOUD_PROJECT: "demo-challenge-suite",
  FIREBASE_PROJECT_ID: "demo-challenge-suite",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-challenge-suite",
  CHALLENGE_SUITE_E2E_PROJECT_ID: "demo-challenge-suite",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
};

for (const [override, expected] of [
  [{ GCLOUD_PROJECT: "challenge-suite" }, /demo-\* GCLOUD_PROJECT/],
  [{ FIREBASE_PROJECT_ID: "challenge-suite" }, /FIREBASE_PROJECT_ID conflicts/],
  [{ FIRESTORE_EMULATOR_HOST: "remote.example:8080" }, /local emulator host/],
  [{ FIREBASE_STORAGE_EMULATOR_HOST: "" }, /local emulator host/],
]) {
  const result = spawnSync(process.execPath, ["scripts/run-p0-emulator-regressions.mjs"], {
    env: { ...base, ...override }, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expected);
  assert.doesNotMatch(result.stdout, /=== scripts\//, "no fixture-writing test may start before isolation validation");
}
console.log("PASS P0 runner rejects production projects, conflicting project IDs, remote hosts, and missing emulators before tests start.");
