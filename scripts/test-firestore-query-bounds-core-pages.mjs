import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

for (const file of [
  "app/api/dashboard/route.ts",
  "app/api/explore/challenges/route.ts",
  "app/api/wallet/route.ts",
  "app/api/sponsor/dashboard/route.ts",
  "app/api/admin/operations/route.ts"
]) {
  const source = read(file);
  assert(source.includes(".limit("), `${file} must bound collection queries`);
}
const participants = read("lib/server/challenge-participants.ts");
assert(participants.includes("limit: 250"));
assert(participants.includes("Math.min(48"));
assert(participants.includes("entries.slice(start, start + pageSize)"));
console.log("Core Firestore query-bound checks passed.");
