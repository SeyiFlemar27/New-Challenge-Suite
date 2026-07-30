import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/challenges/[id]/manage/route.ts");
assert(route.includes("canModerateSensitiveActions"));
assert(route.includes('targetType === "participant" || targetType === "submission"'));
assert(route.includes("ADMIN_REVIEW_REQUIRED"));
console.log("admin-only management action checks passed");
