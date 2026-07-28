import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const profileCandidates = ["app/profile/[userId]/page.tsx", "app/profile/page.tsx", "app/settings/[section]/page.tsx"].map((file) => { try { return read(file); } catch { return ""; } }).join("\n");
const dashboard = read("app/api/dashboard/route.ts");
assert(profileCandidates.includes("badge") || dashboard.includes("badges"), "profile/dashboard foundation must include badge or achievement records");
assert(dashboard.includes("badges") && dashboard.includes("submissions") && dashboard.includes("hostedChallenges"), "current-user data must include badges, submissions, and created challenges for profile/achievement surfaces");
console.log("profile achievements foundation checks passed");