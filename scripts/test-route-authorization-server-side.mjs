import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const routes = {
  admin: read("app/api/admin/operations/route.ts"),
  withdrawal: read("app/api/withdrawals/route.ts"),
  management: read("app/api/challenges/[id]/manage/route.ts"),
  sponsor: read("app/api/sponsor/dashboard/route.ts")
};
assert(routes.admin.includes("requireAdminUser"));
assert(routes.withdrawal.includes("requireRequestUser"));
assert(routes.management.includes("requireRequestUser"));
assert(routes.management.includes("ownsChallenge"));
assert(routes.management.includes("auth.user.isAdmin"));
assert(routes.sponsor.includes("requireSponsorContext"));
console.log("Server-side route authorization checks passed.");
