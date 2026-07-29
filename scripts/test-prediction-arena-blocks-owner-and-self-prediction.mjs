import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/predictions.ts");
const api = read("app/api/predictions/route.ts");
assert(helper.includes("challengeOwnerIds"));
assert(helper.includes('reason = "owner_blocked"'));
assert(helper.includes("isSponsorProfile"));
assert(helper.includes('reason = "admin_blocked"'));
assert(api.includes('String(target.userId ?? "") === user.uid'));
assert(api.includes("You cannot predict yourself to win."));
console.log("prediction owner, host, sponsor, admin, and self blockers passed");
