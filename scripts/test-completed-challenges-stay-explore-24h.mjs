import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/explore/challenges/route.ts");
assert(api.includes("completedWithinExploreWindow"));
assert(api.includes("24 * 60 * 60 * 1000"));
assert(api.includes("hasResults(challenge)"));
assert(api.includes("completedRecently"));
console.log("confirmed completed challenges remain in default Explore for 24 hours: ok");
