import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const boostRoute = read("app/api/rewards/creator-boost/route.ts");
const rewardsPage = read("app/rewards/page.tsx");
const monthlyBoost = read("lib/monthly-boost.ts");
const manualGrant = read("lib/server/reward-manual-grants.ts");
const manualGrantRoute = read("app/api/admin/rewards/manual-grants/route.ts");
const manualGrantPage = read("app/admin/rewards/manual-grant/page.tsx");
const permissions = read("lib/server/admin-permissions.ts");
const rewards = read("lib/server/rewards.ts");
const catalog = read("app/admin/rewards/prize-catalog/page.tsx");

assert.match(rewardsPage, /Apply one 3-day discovery boost/);
assert.match(rewardsPage, /\/api\/rewards\/creator-boost/);
assert.match(rewardsPage, /Your Creator Boost remains available/);
assert.match(boostRoute, /type !== "creator_boost"/);
assert.match(boostRoute, /status !== "available"/);
assert.match(boostRoute, /access\.owner && access\.publiclyVisible && access\.eligibleStatus/);
assert.match(boostRoute, /durationHours: 72/);
assert.match(boostRoute, /status: "consumed"/);
assert.match(boostRoute, /rewardBoostRedemptions/);
assert.match(boostRoute, /deterministicId\("reward_creator_boost", entitlementId\)/);
assert.ok(!boostRoute.includes("monthlyBoostEntitlements"));
assert.match(monthlyBoost, /challenge\.rewardBoostEndsAt/);

assert.match(permissions, /"rewards\.manualGrant"/);
assert.match(manualGrantRoute, /requireRecentAdminAuthentication\(request, "rewards\.manualGrant"\)/);
assert.match(manualGrantRoute, /CONFIRM REWARD GRANT/);
assert.match(manualGrant, /collection\("rewardGrants"\)/);
assert.match(manualGrant, /sourceType: "admin_manual_grant"/);
assert.match(manualGrant, /rewardEntitlementPayload/);
assert.match(manualGrant, /collection\("rewardLedgerEntries"\)/);
assert.match(manualGrant, /collection\("doroCoinTransactions"\)/);
assert.match(manualGrant, /status: "pending_review"/);
assert.match(manualGrant, /externalPayoutExecuted: false/);
assert.match(manualGrant, /rewardAuditLogs/);
assert.match(manualGrantPage, /Resulting fulfillment/);

assert.match(rewards, /SUPPORTED_SPIN_REWARD_TYPES/);
assert.ok(!catalog.includes('<option value="physical_item">'));
assert.ok(!catalog.includes('<option value="badge">'));
assert.match(rewards, /spinCreditExpiryDays: null/);

console.log("Rewards Creator Boost and manual grant contracts passed.");
