import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/dashboard/page.tsx", "utf8");
assert(page.includes("tierStats.slice(0, 3)"), "Creator Studio must keep a concise operational summary");
assert(!page.includes("creatorTools.map"), "Creator Studio must not repeat the full sidebar tool catalog");
assert(page.includes("Your creator activity"), "Creator Studio must prioritize real creator work");
assert(page.includes("hostedChallenges.slice(0, 3)"), "Creator activity must come from real hosted challenge records");
console.log("simplified Creator Studio checks passed");
