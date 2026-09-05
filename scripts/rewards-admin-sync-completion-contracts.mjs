import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const adminWheel = read("app/admin/rewards/prize-wheel/page.tsx");
const rewards = read("lib/server/rewards.ts");
const contracts = read("lib/reward-wheel-contracts.ts");

assert.match(rewards, /allowEmptyDraft\?: boolean/);
assert.match(rewards, /allowEmptyDraft: true/);
assert.match(rewards, /!entries\.length && !options\.allowEmptyDraft/);
assert.match(adminWheel, /Draft could not be saved\. The active Wheel remains unchanged\./);
assert.match(adminWheel, /setRetryToken\(\(value\) => value \+ 1\)/);
assert.ok(!adminWheel.includes("!entries.length || signature"), "an empty Draft must remain autosaveable");

assert.match(adminWheel, /View Configuration/);
assert.match(adminWheel, /Compare with Current/);
assert.match(adminWheel, /Use as New Draft/);
assert.match(adminWheel, /publishChanges/);
assert.match(adminWheel, /No probability changes from the current active Wheel/);
assert.match(rewards, /changeSummary/);
assert.match(rewards, /addedPrizeIds/);
assert.match(rewards, /removedPrizeIds/);
assert.match(rewards, /changedProbabilityPrizeIds/);

assert.match(adminWheel, /handleDialogKeys/);
assert.match(adminWheel, /event\.key === "Escape"/);
assert.match(adminWheel, /event\.key !== "Tab"/);
assert.ok(!adminWheel.includes('["all", "reward_points", "dorocoin", "cash", "physical_item"'), "retired physical reward choices must not appear in the current-release picker");
assert.ok(!adminWheel.includes('"free_entry", "badge"'), "retired badge choices must not appear in the current-release picker");

for (const contract of ["AdminWheelEntry", "AdminWheelDraft", "AdminWheelPreview", "AdminWheelPublishRequest", "AdminWheelPublishResponse"]) {
  assert.match(contracts, new RegExp(`type ${contract}`), `missing typed contract ${contract}`);
}

console.log("Rewards Admin synchronization completion contracts passed.");
