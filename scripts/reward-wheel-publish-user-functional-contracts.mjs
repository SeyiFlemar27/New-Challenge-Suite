import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const contracts = read("lib/reward-wheel-contracts.ts");
const rewards = read("lib/server/rewards.ts");
const wheelRoute = read("app/api/admin/rewards/wheels/route.ts");
const adminWheel = read("app/admin/rewards/prize-wheel/page.tsx");
const userWheel = read("app/rewards/wheel/page.tsx");
const prizeCatalog = read("app/admin/rewards/prize-catalog/page.tsx");
const prizeRoute = read("app/api/admin/rewards/prizes/[prizeId]/route.ts");

assert.match(contracts, /basic: 100/);
assert.match(contracts, /standard: 250/);
assert.match(contracts, /premium: 500/);
assert.match(userWheel, /activeConfig\?\.pointCost \?\? REWARD_WHEEL_POINT_COSTS\[tier\]/);
assert.match(userWheel, /REWARD_WHEEL_POINT_COSTS\[item\]/);
assert.match(userWheel, /Possible Rewards/);
assert.ok(!userWheel.includes('exactProbability.toLocaleString'));

assert.ok(!rewards.includes("item.prizeTier !== input.tier"), "Reward definitions must be reusable across Wheel tiers.");
assert.match(rewards, /prizeTier: input\.tier, probabilityWeight: entry\.weight/);
assert.match(adminWheel, /const tierPrizes = useMemo\(\(\) => data\?\.prizes \?\? \[\]/);
assert.match(adminWheel, /prizeAvailability\(prize\)\.available/);

assert.match(wheelRoute, /action === "publish" \? "rewards\.publish" : "rewards\.configure"/);
assert.ok(!wheelRoute.includes('requireRecentAdminAuthentication(request, "rewards.publish")'));
assert.match(adminWheel, /Reason for change \(optional\)/);
assert.match(adminWheel, /publishMessage \? <div[^>]+role="alert"/);
assert.match(adminWheel, /expectedRevision: revision/);
assert.match(adminWheel, /expectedActiveVersionId: activeId/);
assert.match(adminWheel, /activeVersionId\.slice/);
assert.match(rewards, /WHEEL_PUBLISH_CONFLICT/);

assert.match(rewards, /rewardSnapshots/);
assert.match(rewards, /snapshotsById/);
assert.match(rewards, /status: "published", immutable: true/);
assert.match(rewards, /reward_wheel_version_published/);
assert.match(rewards, /rewardWheelActiveVersions/);
assert.match(rewards, /input\.displayedVersionId !== versionId/);
assert.match(rewards, /transaction\.create\(spinRef, spin\)/);
assert.match(rewards, /transaction\.create\(db\.collection\("rewardGrants"\)/);

for (const action of ["View", "Edit", "Duplicate", "Activate", "Pause", "Resume", "Archive", "Delete permanently"]) {
  assert.ok(prizeCatalog.includes(action), `Prize Catalog action missing: ${action}`);
}
assert.ok(!prizeCatalog.includes('<option value="physical_item">'));
assert.ok(!prizeCatalog.includes('<option value="badge">'));
assert.ok(!prizeCatalog.includes('"physical", "benefits", "recognition"'));
assert.match(prizeRoute, /PRIZE_DELETE_HISTORICAL_REFERENCE/);
assert.match(prizeRoute, /rewardWheelVersions/);
assert.match(prizeRoute, /rewardSnapshots/);
assert.match(prizeRoute, /rewardGrants/);
assert.match(prizeRoute, /rewardEntitlements/);
assert.match(prizeRoute, /rewardFulfillments/);
assert.match(prizeRoute, /rewardLedgerEntries/);
assert.match(prizeRoute, /PRIZE_ARCHIVED_IMMUTABLE/);

console.log("Reward Wheel publish-to-user functional contracts passed.");
