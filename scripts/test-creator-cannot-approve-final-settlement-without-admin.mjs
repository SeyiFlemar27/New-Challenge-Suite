import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const approval = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const manage = read("app/api/challenges/[id]/manage/route.ts");
assert(approval.includes("requireRecentAdminAuthentication") && approval.includes('"settlements.approve"'));
assert(manage.includes("financialExecutionEnabled: false"));
console.log("creator settlement approval restriction checks passed");
