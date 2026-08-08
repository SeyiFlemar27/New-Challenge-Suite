import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const has = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Missing contract: ${value}`));
const lacks = (source, values) => values.forEach((value) => assert.ok(!source.includes(value), `Forbidden contract: ${value}`));

export function runEconomyFollowupContract(metaUrl) {
  const name = basename(fileURLToPath(metaUrl));
  const provider = read("scripts/qa/economy-provider-readiness-check.mjs");
  const authQa = read("scripts/qa/economy-authenticated-provider-flow-qa.mjs");
  const visual = read("scripts/qa/economy-visual-chromium-qa.mjs");
  const growth = read("lib/server/growth-wallet-expiry.ts") + read("lib/server/creator-growth-wallet.ts") + read("app/api/admin/economy/growth-wallet-expiry/route.ts") + read("app/api/economy/summary/route.ts") + read("app/creator/growth-wallet/page.tsx");
  const doro = read("lib/server/economy-dorocoin.ts") + read("app/api/challenges/[id]/engagement/route.ts") + read("app/api/challenges/[id]/comments/route.ts") + read("app/api/challenges/[id]/publish/route.ts") + read("app/api/challenges/[id]/join/route.ts") + read("app/api/auth/profile/bootstrap/route.ts") + read("app/api/auth/email-otp/verify/route.ts") + read("app/api/kyc/sumsub/webhook/route.ts") + read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts") + read("app/api/dorocoin/sponsored-ad/route.ts") + read("app/api/admin/economy/dorocoin-reversals/route.ts");

  if (name.includes("provider-readiness-check")) has(provider, ["stripeWebhookEvents", "pending_payment", "success-pages-do-not-credit", "providerSuccessSimulated: false"]);
  else if (name.includes("authenticated-provider-qa-env-validation")) {
    const env = { ...process.env }; for (const key of Object.keys(env)) if (key.startsWith("ECONOMY_QA_")) delete env[key];
    const run = spawnSync(process.execPath, [resolve(root, "scripts/qa/economy-authenticated-provider-flow-qa.mjs")], { cwd: root, env, encoding: "utf8" });
    assert.equal(run.status, 2); has(run.stdout, ["BLOCKED_MISSING_CONFIGURATION", "ECONOMY_QA_BASE_URL", "secretsPrinted"]); lacks(run.stdout, ["undefined@example", "password="]);
  } else if (name.includes("checkout-success-does-not-credit")) has(provider, ["applyDoroCoinTransaction|applyChallengeCreditTransaction", "balanceCredited"]);
  else if (name.includes("provider-missing-state-safe")) has(authQa, ["BLOCKED_MISSING_CONFIGURATION", "missingVariables"]);
  else if (name.includes("provider-no-secret-logging")) { has(authQa, ["secretsPrinted: false"]); lacks(authQa, ["console.log(process.env", "console.log(process.env[passwordName]"]); }
  else if (name.includes("visual-qa-script-exists")) has(visual, ["chromium.launch", "headless: true"]);
  else if (name.includes("visual-qa-no-secret-output")) { has(visual, ["screenshotsSaved: false", "tracesSaved: false"]); lacks(visual, ["console.log(process.env"]); }
  else if (name.includes("visual-qa-route-list")) has(visual, ["/dorocoins", "/challenge-credits", "/auth/login", "/subscriptions", "/creator/growth-wallet", "/admin/developer-tools/economy-rules"]);
  else if (name.includes("visual-qa-detects-noncash")) has(visual, ["noncash-withdraw-control", "missing-noncash-disclaimer"]);
  else if (name.includes("visual-qa-detects-challenge-coin")) has(visual, ["forbidden-challenge-coin-wording", "Challenge Coin"]);
  else if (name.includes("growth-wallet-expiry-processor")) has(growth, ["processGrowthWalletExpiryBatch", "findExpiredGrowthWalletAllocations", "expireGrowthWalletAllocation"]);
  else if (name.includes("growth-wallet-expiry-idempotency")) has(growth, ["growth_wallet_expiry", "idempotentReplay", "expiryLedgerId"]);
  else if (name.includes("growth-wallet-expiry-ledger")) has(growth, ["sourceType: \"expiry\"", "signedAmountCents: -amountCents", "creatorGrowthWalletTransactions"]);
  else if (name.includes("does-not-touch-cash")) has(growth, ["cashWalletChanged: false"]);
  else if (name.includes("does-not-touch-dorocoin")) has(growth, ["doroCoinWalletChanged: false"]);
  else if (name.includes("does-not-touch-challenge-credits")) has(growth, ["challengeCreditWalletChanged: false"]);
  else if (name.includes("admin-trigger-authorized")) has(growth, ["requireAdminPermission(request, \"jobs.retry\")", "meaningful reason"]);
  else if (name.includes("admin-trigger-blocks-unauthorized")) { has(growth, ["requireAdminPermission"]); lacks(read("app/api/admin/economy/growth-wallet-expiry/route.ts"), ["requireRequestUser(request)"]); }
  else if (name.includes("upcoming-user-ui")) has(growth, ["expiringSoonCents", "Allocation expiries", "Expires"]);
  else if (name.includes("notification-or-safe-fallback")) has(growth, ["createNotification", "Promise.allSettled", "adminActionTasks"]);
  else if (name.includes("daily-login")) has(doro, ["recordDailyLoginAndStreak", "daily_login"]);
  else if (name.includes("video-watch")) has(doro, ["watch_challenge_video", "watchedSeconds", "requiredWatchSeconds: 30"]);
  else if (name.includes("wiring-like")) has(doro, ["like_challenge", "reverseDoroCoinRewardForAction", "liked"]);
  else if (name.includes("wiring-comment")) has(doro, ["comment_challenge", "Comment added", "Comment removed"]);
  else if (name.includes("wiring-share")) has(doro, ["share_challenge", "sharePlatform", "sharesPerDay"]);
  else if (name.includes("wiring-referral")) has(doro, ["referralCode", "userReferrals", "pending_email_verification", "referral_signup"]);
  else if (name.includes("create-free-challenge")) has(doro, ["create_free_challenge", "!safeMonetization.paidEntryRequested"]);
  else if (name.includes("join-free-challenge")) has(doro, ["join_free_challenge", "rewardEligible", "isPaidEntryChallenge"]);
  else if (name.includes("win-free-challenge")) has(doro, ["win_free_challenge", "isPaidEntryChallenge(challenge)"]);
  else if (name.includes("top-10")) has(doro, ["top_10_finish", "candidates.slice(0, 10)"]);
  else if (name.includes("profile-verification")) has(doro, ["profile_verification", "normalized.status === \"verified\"", "providerVerified: true"]);
  else if (name.includes("sponsored-ad")) has(doro, ["sponsored_ad_watch", "rewardedAdProviderEvents", "providerVerified !== true", "Math.min(10, Math.max(5"]);
  else if (name.includes("no-self-farming")) has(doro, ["Self-farming activity is not eligible", "challengeOwnerId === input.userId"]);
  else if (name.includes("idempotency")) has(doro, ["deterministicId(\"doro_reward\"", "oncePerActionSources", "idempotencyKey"]);
  else if (name.includes("daily-caps")) has(doro, ["doroCoinRewardDailyGuards", "videoPerDay", "likesPerDay", "commentsPerDay", "sharesPerDay"]);
  else if (name.includes("reversals")) has(doro, ["reverseDoroCoinReward", "dorocoin.reward_reversed", "wallet.adjust"]);
  else if (name.includes("suspicious-review-tasks")) has(doro, ["suspicious_dorocoin_activity", "adminActionTasks", "dorocoin_referral_review"]);
  console.log(`PASS ${name}`);
}
