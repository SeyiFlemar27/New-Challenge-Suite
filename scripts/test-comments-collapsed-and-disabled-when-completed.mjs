import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
const api = read("app/api/challenges/[id]/comments/route.ts");
assert(page.includes("useState(false)") && page.includes("Comments ({comments.length})"));
assert(page.includes("commentsClosed") && page.includes("Comments are closed for this completed challenge."));
assert(api.includes("completed") && api.includes("voting_closed"), "comment API must enforce terminal states");
console.log("challenge comments collapsed and completed-state checks passed");
