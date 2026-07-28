import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/challenges/[id]/manage/page.tsx"
);
assert(source.includes("canonical challenge lifecycle rules"), "missing " + "canonical challenge lifecycle rules");
assert(source.includes("admin review"), "missing " + "admin review");
console.log("test-phase5-safe-lifecycle-actions checks passed");
