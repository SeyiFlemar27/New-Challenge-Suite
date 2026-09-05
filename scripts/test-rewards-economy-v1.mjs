import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const economy = read("lib/server/reward-economy.ts");
const spinRoute = read("app/api/rewards/spin/route.ts");
const checkout = read("app/api/challenges/[id]/entry-checkout/route.ts");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const payments = read("lib/server/monetization-payments.ts");
const vote = read("app/api/votes/route.ts");
const profile = read("app/api/profile/me/route.ts");
const verification = read("app/api/auth/email-otp/verify/route.ts");
const winnerApproval = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const adminPermissions = read("lib/server/admin-permissions.ts");
const adjustment = read("app/api/admin/rewards/adjustments/route.ts");
const emergency = read("app/api/admin/rewards/emergency/route.ts");
const reconciliation = read("app/api/admin/rewards/reconcile/route.ts");
const hub = read("app/rewards/page.tsx");
const wheel = read("app/rewards/wheel/page.tsx");

assert.match(rewards, /spinCosts: REWARD_WHEEL_POINT_COSTS/);
assert.match(rewards, /pointsPerDoroCoin: 0/);
assert.match(rewards, /awardDoroCoinPurchaseRewards[\s\S]*eventType: "dorocoin_purchase"/);
assert.match(rewards, /rewardGrants/);
assert(rewards.includes("randomInt"));
assert(!rewards.includes("Math.random"));
assert(rewards.includes("isPrizeActive"));
assert(rewards.includes("item.rewardValue <= 0"));
assert(rewards.includes("REWARD_POINT_RETURN_RATIO_BLOCKED"));
assert(rewards.includes("serverSelected: true"));
assert(rewards.includes("cashOutEnabled: false"));
assert(spinRoute.includes("executeRewardSpin"));
assert(!spinRoute.includes("prizeId"));

assert(!rewards.includes("DEFAULT_REWARD_PRIZES"), "production must require Admin-configured rewards");

for (const event of ["profile_completed", "account_verified", "approved_submission", "challenge_participation_completed", "valid_free_vote", "dorocoin_purchase", "challenge_first_place", "challenge_second_place", "challenge_third_place", "individual_tournament_champion", "winning_team_tournament_member"]) assert(economy.includes(`"${event}"`));
for (const forbidden of ["challenge_joined", "paid_vote", "ad_vote", "sponsor_activity", "admin_activity"]) assert(!economy.includes(`"${forbidden}"`));
for (const milestone of ["days: 3, points: 25", "days: 7, points: 50", "days: 14, points: 100", "days: 30, points: 250"]) assert(economy.includes(milestone));
assert(economy.includes('dailyCap: 50'));
assert(economy.includes('checkInAwardsPoints: false') || rewards.includes('checkInAwardsPoints: false'));
assert(economy.includes("rewardDebt"));
assert(economy.includes("immutable: true"));
assert(economy.includes("transferable: false"));
assert(economy.includes("withdrawable: false"));

assert(vote.includes('eventType: "valid_free_vote"'));
assert(profile.includes('eventType: "profile_completed"'));
assert(verification.includes('eventType: "account_verified"'));
assert(winnerApproval.includes('"individual_tournament_champion"'));
assert(winnerApproval.includes('eventType: "challenge_participation_completed"'));

assert(checkout.includes("rewardEntitlementId"));
assert(checkout.includes("record.amountCents"));
assert(checkout.includes("confirmRewardEntitledEntry"));
assert(checkout.includes("releaseEntryEntitlementReservation"));
assert(joinPage.includes("selectedRewardId"));
assert(joinPage.includes("rewardEntitlementId: selectedRewardId || undefined"));
assert(payments.includes("consumeEntryEntitlement"));
assert(payments.includes('provider: "reward_entitlement"'));
assert(payments.includes('restorationPolicy: "manual_review_required"'));
assert(payments.includes("grossEntryFeeCents"));
assert(payments.includes("rewardDiscountCents"));

for (const permission of ["rewards.view", "rewards.configure", "rewards.publish", "rewards.adjustUser", "rewards.investigate", "rewards.emergencyControl"]) assert(adminPermissions.includes(`"${permission}"`));
assert(adjustment.includes('requireRecentAdminAuthentication(request, "rewards.adjustUser")'));
assert(emergency.includes('requireRecentAdminAuthentication(request, "rewards.emergencyControl")'));
assert(emergency.includes("reason.length < 8"));
assert(reconciliation.includes('requireAdminPermission(request, "rewards.investigate")'));
assert(reconciliation.includes("repairPerformed: false"));
assert(hub.includes("verified Challenge Suite activity"));
assert(!hub.includes("Buy DoroCoins"));
assert(wheel.includes("Math.floor(points / Math.max(1, cost))"));
assert(wheel.includes("Confirm Spin"));
assert(!wheel.includes("spin credit"));

console.log("Rewards Economy V1 contract checks passed.");
