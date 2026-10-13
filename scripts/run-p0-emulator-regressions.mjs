import { spawnSync } from "node:child_process";

// Fail before importing application code or creating any test fixtures.
const projectId = process.env.GCLOUD_PROJECT;
if (!projectId?.startsWith("demo-")) {
  throw new Error("P0 regressions require a demo-* GCLOUD_PROJECT supplied by Firebase emulators:exec.");
}
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  const value = process.env[name];
  if (!value || !/^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(value)) {
    throw new Error(`${name} must identify a local emulator host and port.`);
  }
}
for (const name of ["FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "CHALLENGE_SUITE_E2E_PROJECT_ID", "GOOGLE_CLOUD_PROJECT"]) {
  if (process.env[name] && process.env[name] !== projectId) {
    throw new Error(`${name} conflicts with the isolated emulator project.`);
  }
  process.env[name] = projectId;
}
process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS = "true";

process.env.STRIPE_SECRET_KEY ??= "sk_test_deterministic_p0_regressions";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_deterministic_p0_regressions";

const tests = [
  "scripts/test-enterprise-prize-exposure.mjs",
  "scripts/test-revenue-foundation-ownership.mjs",
  "scripts/test-enterprise-prize-pool-lifecycle.mjs",
  "scripts/test-enterprise-prize-cap-concurrency.mjs",
  "scripts/test-enterprise-active-cap-concurrency.mjs",
  "scripts/test-enterprise-review-authorization.mjs",
  "scripts/test-enterprise-refund-settlement-lock.mjs",
  "scripts/test-enterprise-storage-rules.mjs",
  "scripts/test-storage-rules-document-access-limit.mjs",
  "scripts/test-challenge-media-delivery-emulator.mjs",
  "scripts/test-challenge-media-serialization.mjs",
  "scripts/test-challenge-comments-route.mjs",
  "scripts/test-challenge-leaderboard-emulator.mjs",
  "scripts/test-media-upload-storage-rules.mjs",
  "scripts/test-enterprise-ownership-migration.mjs",
  "scripts/test-authoritative-media-verification.mjs",
  "scripts/test-media-verification-reuse.mjs",
  "scripts/test-private-access-method-enforcement.mjs",
  "scripts/test-sponsor-proposal-retirement.mjs",
  "scripts/test-payment-return-routes.mjs",
  "scripts/test-tournament-paid-entry-emulator.mjs",
  "scripts/test-tournament-cloud-tasks.mjs",
  "scripts/test-stripe-sponsor-disputes-emulator.mjs",
  "scripts/test-stripe-webhook-route-paid-vote.mjs",
  "scripts/test-enterprise-finance-route.mjs",
  "scripts/test-private-access-requests-route.mjs",
  "scripts/test-tournament-team-privacy-route.mjs",
  "scripts/test-auth-session-persistence-route.mjs",
  "scripts/test-auth-session-cookie-refresh-without-login-loop.mjs",
  "scripts/test-tournament-team-lifecycle-contracts.mjs",
  "scripts/test-tournament-team-management-ui-contracts.mjs",
  "scripts/test-tournament-voting-route.mjs",
  "scripts/test-tournament-voting-judging.mjs",
  "scripts/test-sponsor-agreement-lifecycle.mjs",
  "scripts/test-settlement-blocks-pending-sponsor-reservations.mjs",
  "scripts/test-discovery-analytics-scalability.mjs",
  "scripts/test-dedicated-discovery-pagination.mjs",
  "scripts/test-admin-support-workflows.mjs",
];

for (const test of tests) {
  console.log(`\n=== ${test} ===`);
  const testLoaders = test === "scripts/test-tournament-paid-entry-emulator.mjs"
    ? ["--experimental-loader", "./scripts/tournament-paid-entry-stripe-loader.mjs"]
    : [];
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", ...testLoaders, test], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
