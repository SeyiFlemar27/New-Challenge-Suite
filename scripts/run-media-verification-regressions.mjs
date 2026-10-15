import { spawnSync } from "node:child_process";
if (!process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("An isolated demo project is required");
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) if (!/^127\.0\.0\.1:\d+$/.test(process.env[name] ?? "")) throw new Error(`Local ${name} required`);
const env = { ...process.env, CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: "true", FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, FIREBASE_STORAGE_BUCKET: `${process.env.GCLOUD_PROJECT}.appspot.com`, NORMAL_LIFECYCLE_SCHEDULER_ENABLED: "false", NORMAL_AUTOMATIC_REFUNDS_ENABLED: "false" };
for (const test of ["test-media-token-revocation.mjs", "test-media-publish-handlers-emulator.mjs", "test-private-v2-access-emulator.mjs", "test-media-verification-reuse.mjs", "test-authoritative-media-verification.mjs", "test-creator-image-verification-emulator.mjs", "test-normal-builder-frontend.mjs"]) {
  console.log(`Running ${test}`);
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", `scripts/${test}`], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.argv.includes("--browser")) {
  const result = spawnSync(process.execPath, ["scripts/qa/run-p1-browser-e2e.mjs"], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
