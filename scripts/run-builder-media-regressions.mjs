import { spawnSync } from "node:child_process";
if (!process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("Local demo project required");
for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) if (!/^127\.0\.0\.1:\d+$/.test(process.env[key] ?? "")) throw new Error(`Local ${key} required`);
const env = { ...process.env, FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, FIREBASE_STORAGE_BUCKET: `${process.env.GCLOUD_PROJECT}.appspot.com`, CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: "true", NORMAL_LIFECYCLE_SCHEDULER_ENABLED: "false", NORMAL_AUTOMATIC_REFUNDS_ENABLED: "false" };
for (const test of ["test-media-upload-storage-rules.mjs", "test-storage-rules-document-access-limit.mjs", "test-enterprise-storage-rules.mjs", "test-creator-image-verification-emulator.mjs", "test-private-v2-access-emulator.mjs", "test-private-access-requests-route.mjs", "test-authoritative-media-verification.mjs", "test-normal-builder-frontend.mjs", "normal-challenge-v2-contracts.mjs", "test-media-upload-validation.mjs"]) {
  console.log(`Running ${test}`);
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", `scripts/${test}`], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
