import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/sponsor/dashboard/page.tsx");
assert(dashboard.includes("sponsor_approval_seen_"));
assert(dashboard.includes("localStorage.getItem") && dashboard.includes("localStorage.setItem"));
console.log("sponsor approval notice dismissal checks passed");
