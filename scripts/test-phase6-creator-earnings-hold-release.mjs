import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"lib/server/prize-approvals.ts"
);
assert(source.includes("creatorHostOperatorShareCents"), "missing " + "creatorHostOperatorShareCents");
assert(source.includes("holdUntil"), "missing " + "holdUntil");
assert(source.includes("balanceBucket: \"pending\""), "missing " + "balanceBucket: \"pending\"");
console.log("test-phase6-creator-earnings-hold-release checks passed");
