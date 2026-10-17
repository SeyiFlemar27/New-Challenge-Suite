import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/);
const env = { ...process.env, FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: "true" };
// These are local worker tests, never Cloud Tasks dispatch or live financial calls.
for (const key of Object.keys(env)) if (key.startsWith("TOURNAMENT_CLOUD_TASKS_") || key.startsWith("GOOGLE_WORKLOAD_IDENTITY_")) delete env[key];
delete env.GOOGLE_CLOUD_PROJECT;
delete env.GOOGLE_CLOUD_PROJECT_NUMBER;
for (const key of ["FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL", "GOOGLE_APPLICATION_CREDENTIALS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) delete env[key];
const tests = ["test-tournament-new-policy.mjs", "test-tournament-public-route-policy.mjs", "test-tournament-draft-adoption-emulator.mjs", "test-challenge-leaderboard-emulator.mjs", "test-tournament-v3-policy.mjs", "test-tournament-vote-pagination.mjs", "test-tournament-settlement-allocation.mjs", "test-tournament-vote-pagination-emulator.mjs", "test-tournament-automatic-results-emulator.mjs", "test-tournament-voting-route.mjs", "test-tournament-creator-funding-emulator.mjs", "test-tournament-member-payments-emulator.mjs", "test-tournament-settlement-emulator.mjs", "test-automatic-voting-emulator.mjs"];
if (env.FIREBASE_STORAGE_EMULATOR_HOST) {
  assert.match(env.FIREBASE_STORAGE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
  env.FIREBASE_STORAGE_BUCKET = `${env.GCLOUD_PROJECT}.appspot.com`;
  tests.push("test-tournament-submission-media-emulator.mjs");
}
tests.push("test-tournament-sponsor-cutoff.mjs", "test-tournament-public-team-emulator.mjs", "test-tournament-sponsor-lifecycle-emulator.mjs", "test-sponsor-agreement-lifecycle.mjs", "test-stripe-sponsor-disputes-emulator.mjs");
tests.push("test-tournament-notifications-emulator.mjs");
tests.push("test-tournament-first-voting-cutoff-emulator.mjs");
const requested = process.env.CHALLENGE_SUITE_TOURNAMENT_REGRESSION_TESTS?.split(",").map(value => value.trim()).filter(Boolean);
if (requested?.some(file => !tests.includes(file))) throw new Error("Only explicitly listed isolated regression tests may be selected.");
const selected = requested?.length ? tests.filter(file => requested.includes(file)) : tests;
console.log(`Tournament regressions: ${selected.length}/${tests.length} suites selected${requested?.length ? "; focused subset, not a full-suite result" : ""}.`);
for (const file of selected) {
  console.log(`Running ${file}`);
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", `scripts/${file}`], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
