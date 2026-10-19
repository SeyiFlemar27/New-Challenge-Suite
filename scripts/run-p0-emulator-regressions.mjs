import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

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
process.env.NORMAL_LIFECYCLE_SCHEDULER_ENABLED = "false";
process.env.NORMAL_AUTOMATIC_REFUNDS_ENABLED = "false";

process.env.STRIPE_SECRET_KEY ??= "sk_test_deterministic_p0_regressions";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_deterministic_p0_regressions";

const tests = [
  "scripts/test-normal-base-prize-policy.mjs",
  "scripts/test-normal-review-funding-emulator.mjs",
  "scripts/test-normal-paid-entry-emulator.mjs",
  "scripts/test-normal-lifecycle-emulator.mjs",
  "scripts/test-normal-financial-lifecycle-emulator.mjs",
  "scripts/test-normal-settlement-emulator.mjs",
  "scripts/test-normal-scheduler-emulator.mjs",
  "scripts/test-normal-qualified-prizes.mjs",
  "scripts/test-submission-edit-handler-emulator.mjs",
  "scripts/test-submission-resubmission-policy.mjs",
  "scripts/test-sponsor-reservation-policy.mjs",
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
  "scripts/test-tournament-new-policy.mjs",
  "scripts/test-tournament-public-route-policy.mjs",
  "scripts/test-tournament-draft-adoption-emulator.mjs",
  "scripts/test-tournament-public-team-emulator.mjs",
  "scripts/test-tournament-vote-pagination.mjs",
  "scripts/test-tournament-settlement-allocation.mjs",
  "scripts/test-tournament-vote-pagination-emulator.mjs",
  "scripts/test-tournament-automatic-results-emulator.mjs",
  "scripts/test-tournament-creator-funding-emulator.mjs",
  "scripts/test-tournament-member-payments-emulator.mjs",
  "scripts/test-tournament-settlement-emulator.mjs",
  "scripts/test-tournament-submission-media-emulator.mjs",
  "scripts/test-automatic-voting-emulator.mjs",
  "scripts/test-tournament-sponsor-cutoff.mjs",
  "scripts/test-tournament-sponsor-lifecycle-emulator.mjs",
  "scripts/test-tournament-notifications-emulator.mjs",
  "scripts/test-tournament-first-voting-cutoff-emulator.mjs",
  "scripts/test-tournament-team-entitlements-emulator.mjs",
  "scripts/test-tournament-complete-lifecycles-emulator.mjs",
  "scripts/test-live-event-admission-emulator.mjs",
  "scripts/test-media-publish-handlers-emulator.mjs",
  "scripts/test-publishing-review-emulator.mjs",
];

const results = [];
function recordResults(complete) { if (process.env.CHALLENGE_SUITE_TEST_RESULTS_PATH) writeFileSync(process.env.CHALLENGE_SUITE_TEST_RESULTS_PATH, JSON.stringify({ complete, total: tests.length, results }, null, 2)); }
recordResults(false);
for (const test of tests) {
  console.log(`\n=== ${test} ===`);
  const testLoaders = test === "scripts/test-tournament-paid-entry-emulator.mjs"
    ? ["--experimental-loader", "./scripts/tournament-paid-entry-stripe-loader.mjs"]
    : [];
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", ...testLoaders, test], { cwd: repoRoot, stdio: "inherit", env: process.env, timeout: 600_000 });
  results.push({ test, startedAt, completedAt: new Date().toISOString(), exitCode: result.status, errorCode: result.error?.code ?? null });
  recordResults(false);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
recordResults(true);
console.log(`Full P0: ${results.length}/${tests.length} suites passed.`);
