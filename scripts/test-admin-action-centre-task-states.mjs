import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/admin/admin-control-center.tsx");
assert(source.includes('"action-centre"'));
assert(source.includes("function ActionCentre"));
for (const queue of ["Sponsor applications", "Challenge reviews", "Submission reviews", "Winner reviews", "Withdrawal reviews", "Open disputes"]) assert(source.includes(queue));
assert(source.includes("Nothing is generated to fill an empty queue."));
console.log("admin action centre real task states: ok");
