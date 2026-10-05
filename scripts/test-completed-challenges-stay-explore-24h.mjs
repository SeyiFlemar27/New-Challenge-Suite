import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/explore/challenges/route.ts");
assert(api.includes("completedWithinExploreWindow"));
assert(api.includes("5 * 60 * 1000"), "completed challenges must leave Explore five minutes after official results are announced");
assert(!api.includes("24 * 60 * 60 * 1000"), "Explore must not retain completed challenges for the retired 24-hour window.");
assert(api.includes("hasResults(challenge)"));
assert(api.includes("completedRecently"));
console.log("confirmed completed challenges leave default Explore five minutes after official results: ok");
