import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("ownsChallenge"), "missing " + "ownsChallenge");
assert(source.includes("isAdmin"), "missing " + "isAdmin");
assert(source.includes("FORBIDDEN"), "missing " + "FORBIDDEN");
console.log("test-phase5-owner-sponsor-management-authorization checks passed");
