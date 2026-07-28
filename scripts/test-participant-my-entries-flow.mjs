import assert from "node:assert/strict";
import { read, exists } from "./production-flow-test-utils.mjs";
const page = read("app/my-entries/page.tsx");
const dashboard = read("app/api/dashboard/route.ts");
assert(exists("app/my-entries/page.tsx"), "My Entries page must exist");
assert(page.includes("My Entries") && page.includes("fetchDashboard"), "My Entries page must load current-user dashboard data");
assert(dashboard.includes("challengeParticipants") && dashboard.includes("submissions") && dashboard.includes("where(\"userId\", \"==\", user.uid)"), "dashboard API must aggregate current user's participant/submission records server-side");
assert(!page.includes("fake") && !page.includes("mock"), "My Entries must not show fake entries");
console.log("participant My Entries flow checks passed");