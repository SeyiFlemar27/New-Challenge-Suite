import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/challenges/[id]/manage/page.tsx"
);
assert(source.includes("/entry-requests"), "missing " + "/entry-requests");
assert(source.includes("Entry Requests"), "missing " + "Entry Requests");
console.log("test-phase5-entry-request-management-flow checks passed");
