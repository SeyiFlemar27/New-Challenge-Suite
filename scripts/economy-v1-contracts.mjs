import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const files = {
  rules: read("lib/server/economy-rules.ts"),
  doro: read("lib/server/dorocoin.ts") + read("lib/server/economy-dorocoin.ts"),
  doroSpend: read("app/api/dorocoin/spend/route.ts"),
  doroAdmin: read("app/api/dorocoin/transactions/route.ts"),
  doroCheckout: read("app/api/stripe/dorocoin-checkout/route.ts"),
  credits: read("lib/server/challenge-credits.ts"),
  creditCheckout: read("app/api/challenge-credits/checkout/route.ts"),
  webhook: read("app/api/stripe/webhook/route.ts"),
  voting: read("lib/server/voting.ts") + read("app/api/votes/route.ts"),
  detail: read("app/api/challenges/[id]/route.ts") + read("app/challenges/[id]/page.tsx"),
  settlement: read("lib/server/challenge-settlement.ts"),
  create: read("app/api/challenges/route.ts") + read("app/api/challenges/[id]/publish/route.ts"),
  profile: read("lib/server/social-profile.ts") + read("components/social/public-profile.tsx") + read("app/api/admin/creator-levels/[userId]/route.ts"),
  growth: read("lib/server/creator-growth-wallet.ts") + read("app/api/creator/growth-wallet/route.ts") + read("app/api/creator/growth-wallet/spend/route.ts") + read("app/creator/growth-wallet/page.tsx"),
  wallet: read("app/api/wallet/route.ts") + read("app/api/economy/summary/route.ts") + read("app/dorocoins/page.tsx") + read("app/challenge-credits/page.tsx"),
  sponsor: read("app/api/sponsor/campaigns/[campaignId]/promote/route.ts"),
  admin: read("app/api/admin/economy-rules/route.ts") + read("app/api/admin/economy-adjustments/route.ts") + read("app/admin/developer-tools/economy-rules/page.tsx") + read("components/admin/admin-shell.tsx"),
  prediction: read("app/challenges/[id]/prediction/page.tsx") + read("lib/server/predictions.ts")
};

function has(source, values) { for (const value of values) assert.ok(source.includes(value), `Missing required contract: ${value}`); }
function lacks(source, values) { for (const value of values) assert.ok(!source.includes(value), `Forbidden contract found: ${value}`); }

export function runEconomyContract(metaUrl) {
  const name = basename(fileURLToPath(metaUrl));
  has(files.rules, ["ECONOMY_V1_RULE_VERSION", "getActiveEconomyRules", "getEconomyRuleVersion"]);
  lacks(files.wallet + files.credits + files.doro, ["Math.random()"]);

  if (name.includes("rules-versioning")) has(files.rules + files.create + files.admin, ["economyRuleVersions", "economyRuleVersion", "affectsFutureTransactionsOnly"]);
  else if (name.includes("super-admin")) has(files.admin, ["requireRecentAdminAuthentication", "super_admin", "platform_owner", "writeAuditLog"]);
  else if (name.includes("name-maintained")) has(read("app/dorocoins/page.tsx"), ["DoroCoins"]);
  else if (name.includes("not-renamed")) lacks(read("app/dorocoins/page.tsx") + read("components/sidebar.tsx"), ["Challenge Coins"]);
  else if (name.includes("earning-values")) has(files.rules, ["daily_login: 10", "watch_challenge_video: 2", "like_challenge: 1", "comment_challenge: 3", "share_challenge: 5", "referral_signup: 50", "create_free_challenge: 25", "join_free_challenge: 20", "win_free_challenge: 150", "top_10_finish: 75", "profile_verification: 100", "sponsored_ad_watch: 5"]);
  else if (name.includes("daily-login")) has(files.doro, ["recordDailyLoginAndStreak", "daily_login"]);
  else if (name.includes("watch-video")) has(files.doro, ["watchedSeconds", "requiredWatchSeconds", "Minimum watch time"]);
  else if (name.includes("like-comment-share-caps")) has(files.doro, ["videoPerDay", "likesPerDay", "commentsPerDay", "sharesPerDay", "doroCoinRewardDailyGuards"]);
  else if (name.includes("no-self-farming")) has(files.doro, ["Self-farming activity is not eligible"]);
  else if (name.includes("reward-reversal")) has(files.doro, ["reverseDoroCoinReward", "reversalTransactionId", "reversedAt"]);
  else if (name.includes("suspicious-activity")) has(files.doro, ["suspicious_dorocoin_activity", "adminActionTasks"]);
  else if (name.includes("streak-rewards")) has(files.doro, ["currentStreak", "lastRewardDay", "streak_bonus"]);
  else if (name.includes("90-day-365")) has(files.rules, ["90: { coins: 5_000", "365: { coins: 25_000", "legendary_streak_365"]);
  else if (name.includes("spending-non-cash")) { has(files.doroSpend, ["free_community_challenge_entry", "challenge_visibility_boost", "not cash"]); lacks(files.doroSpend, ["vote_spend", "membership"]); }
  else if (name.includes("cannot-buy-votes")) { has(files.rules, ["canBuyVotes: false"]); lacks(files.voting, ["doroCoinWallets"]); }
  else if (name.includes("dorocoin-cannot-withdraw") || name.includes("no-dorocoin-cash")) has(files.rules + files.wallet, ["withdrawable: false", "cashConvertible: false"]);
  else if (name.includes("dorocoin-purchase")) { has(files.doroCheckout + files.webhook, ["pending_payment", "assertPaidPaymentSession", "balanceCredited: true"]); lacks(files.doroCheckout, ["stripeDevMockCheckout"]); }
  else if (name.includes("dorocoin-transfer")) has(files.doro, ["doroCoinTransfers", "transfer_out", "transfer_in", "dailyMaximum"]);
  else if (name.includes("dorocoin-admin")) has(files.doroAdmin, ["requireRecentAdminAuthentication", "wallet.adjust", "meaningful adjustment reason", "writeAuditLog"]);
  else if (name.includes("credit-packages")) has(files.rules, ["credits_500", "credits_1050", "credits_2700", "credits_5600", "credits_11500", "creditsPerUsd: 100"]);
  else if (name.includes("credit-purchase")) has(files.creditCheckout + files.webhook, ["pending_payment", "challenge_credit_purchase", "payment_status !== \"paid\"", "balanceCredited: true"]);
  else if (name.includes("credit-spend")) has(files.credits + files.voting, ["paid_vote_spend", "signedAmount: -creditCost", "balanceAfter"]);
  else if (name.includes("credit-transfer")) has(files.credits, ["challengeCreditTransfers", "transfer_out", "transfer_in", "dailyMaximum"]);
  else if (name.includes("credit-refund")) has(files.rules + files.admin, ["duplicate_payment", "failed_delivery", "provider_error", "admin_approved", "providerRefundExecuted: false"]);
  else if (name.includes("credit-cannot-withdraw") || name.includes("no-credit-cash")) has(files.credits + files.wallet, ["withdrawable: false", "cashConvertible: false"]);
  else if (name.includes("credit-not-prediction")) { has(files.rules + files.prediction, ["predictionArenaEligible: false", "DoroCoins cannot be used"]); lacks(files.prediction, ["challengeCreditWallets"]); }
  else if (name.includes("one-free-vote")) has(files.voting, ["freeVoteDailyGuards", "FREE_CHALLENGE_DAILY_LIMIT_REACHED", "quantity !== 1"]);
  else if (name.includes("cost-10")) has(files.rules + files.voting, ["paidVoteCostCredits: 10", "calculatePaidVoteCost"]);
  else if (name.includes("limit-default-10")) has(files.rules + files.voting, ["paidVoteDailyLimit: 10", "paidVoteDailyGuards"]);
  else if (name.includes("free-vs-paid-breakdown")) has(files.detail, ["freeVoteCount", "paidVoteCount", "voteBreakdown"]);
  else if (name.includes("revenue-held")) has(files.voting, ["held_pending_challenge_completion", "releaseRequiresFraudClearance", "releaseRequiresDisputeClearance"]);
  else if (name.includes("settlement-blocked")) has(files.voting, ["releaseRequiresDisputeClearance", "releaseRequiresVoteIntegrityClearance"]);
  else if (name.includes("split-new")) has(files.rules + files.settlement + files.create, ["winnerPercent: 65", "platformPercent: 15", "creatorPercent: 20", "hostSponsorPercent: 0", "economyRuleVersion"]);
  else if (name.includes("old-challenges")) has(files.settlement, ["legacy_paid_entry_v0", "calculatePaidRevenueSplit", "economyV1"]);
  else if (name.includes("unresolved-host")) has(files.settlement, ["settlementUnresolvedAllocations", "requires_admin_resolution", "paid_entry_host_sponsor_allocation_unresolved"]);
  else if (name.includes("split-after")) has(files.settlement, ["Admin-approved winners are required before settlement", "proposalSnap.data()?.status !== \"approved\""]);
  else if (name.includes("paid-entry-rule")) has(files.settlement + files.create, ["economyRuleVersion", "ECONOMY_V1_RULE_VERSION"]);
  else if (name.includes("levels-document")) has(files.rules, ["Rookie Creator", "Rising Star", "Verified Creator", "Pro Creator", "Elite Creator", "Hall of Fame Creator"]);
  else if (name.includes("levels-performance")) has(files.rules, ["completedChallenges", "participantCount", "revenueCents", "completionRate", "disputeRate"]);
  else if (name.includes("level-public")) has(files.profile, ["creatorLevel", "level.name"]);
  else if (name.includes("verified-creator")) has(files.profile + files.rules, ["requiresVerification", "VERIFICATION_REQUIRED"]);
  else if (name.includes("growth-wallet-allocation")) has(files.growth + files.settlement, ["calculateGrowthWalletAllocation", "creator_earning_allocation", "allocationPercent"]);
  else if (name.includes("growth-wallet-not")) has(files.growth, ["withdrawable: false", "restrictedUseOnly: true"]);
  else if (name.includes("growth-wallet-expiry")) has(files.growth + files.settlement, ["expiry", "expiresAt", "expiryMonths"]);
  else if (name.includes("four-separate")) has(files.wallet, ["Cash Wallet", "DoroCoins", "Challenge Credits", "Creator Growth Wallet"]);
  else if (name.includes("only-cash")) has(files.wallet, ["Only Cash Wallet can be withdrawn", "withdrawable: false"]);
  else if (name.includes("histories")) has(files.wallet, ["doroCoinTransactions", "challengeCreditTransactions", "creatorGrowthWalletTransactions"]);
  else if (name.includes("sponsor-economy")) has(files.sponsor, ["assertSponsorOwnedDoc", "sponsor_campaign_promotion_spend", "CAMPAIGN_NOT_APPROVED"]);
  else if (name.includes("sponsor-funded")) { has(files.settlement, ["sponsorMoneyExcludedFromChallengeSplit: true", "creatorReceivesSponsorMoney: false"]); lacks(files.sponsor, ["sponsor_prize"]); }
  else if (name.includes("admin-economy")) has(files.admin, ["Developer Tools", "Economy Rules", "/admin/developer-tools/economy-rules"]);
  else if (name.includes("no-fake-balances")) { lacks(files.wallet + files.admin, ["mockBalance", "fakeBalance"]); has(files.wallet, ["doroCoinWallets", "challengeCreditWallets", "creatorGrowthWallets"]); }
  else if (name.includes("no-client-side")) { has(files.webhook, ["challenge_credit_purchase", "payment_status !== \"paid\""]); lacks(read("app/challenge-credits/success/page.tsx"), ["applyChallengeCreditTransaction", "balanceCredited"]); }

  console.log(`PASS ${name}`);
}
