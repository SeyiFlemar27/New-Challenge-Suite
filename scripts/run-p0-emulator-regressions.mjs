import { spawnSync } from "node:child_process";

process.env.STRIPE_SECRET_KEY ??= "sk_test_deterministic_p0_regressions";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_deterministic_p0_regressions";

const tests = [
  "scripts/test-enterprise-prize-exposure.mjs",
  "scripts/test-enterprise-prize-pool-lifecycle.mjs",
  "scripts/test-enterprise-prize-cap-concurrency.mjs",
  "scripts/test-enterprise-active-cap-concurrency.mjs",
  "scripts/test-enterprise-refund-settlement-lock.mjs",
  "scripts/test-enterprise-storage-rules.mjs",
  "scripts/test-enterprise-ownership-migration.mjs",
  "scripts/test-authoritative-media-verification.mjs",
  "scripts/test-private-access-method-enforcement.mjs",
  "scripts/test-sponsor-proposal-retirement.mjs",
  "scripts/test-payment-return-routes.mjs",
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
  "scripts/test-discovery-analytics-scalability.mjs",
];

for (const test of tests) {
  console.log(`\n=== ${test} ===`);
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/ts-alias-loader.mjs", test], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
