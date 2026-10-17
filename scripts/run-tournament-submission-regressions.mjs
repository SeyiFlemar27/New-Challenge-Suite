import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/);
const env = { ...process.env, FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, FIREBASE_STORAGE_BUCKET: `${process.env.GCLOUD_PROJECT}.appspot.com`, CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: "true" };
for (const key of Object.keys(env)) if (key.startsWith("TOURNAMENT_CLOUD_TASKS_") || key.startsWith("GOOGLE_WORKLOAD_IDENTITY_") || ["FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT_NUMBER"].includes(key)) delete env[key];
const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", "scripts/test-tournament-submission-media-emulator.mjs"], { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
