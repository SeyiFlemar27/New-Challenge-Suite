import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const rewards=read("lib/server/rewards.ts"), admin=read("app/api/admin/rewards/prizes/route.ts");
assert(rewards.includes('probabilityWeight') && rewards.includes('randomInt') && rewards.includes('remainingQuantity'));
assert(admin.includes('requireAdminPermission(request, "rewards.configure")') && admin.includes('adminPrizePayload'));
console.log("Phase 9 admin prize weight checks passed.");
