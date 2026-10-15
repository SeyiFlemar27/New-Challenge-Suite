import { spawnSync } from "node:child_process";
if (!process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("A local demo Firebase project is required.");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env[key] ?? "")) throw new Error(`Local ${key} required`);
}
for (const test of ["scripts/test-private-v2-access-emulator.mjs", "scripts/test-private-access-requests-route.mjs", "scripts/test-normal-paid-entry-emulator.mjs", "scripts/test-normal-builder-frontend.mjs", "scripts/test-private-access-method-enforcement.mjs"]) {
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", test], { stdio: "inherit", env: { ...process.env, NORMAL_LIFECYCLE_SCHEDULER_ENABLED: "false", NORMAL_AUTOMATIC_REFUNDS_ENABLED: "false" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
