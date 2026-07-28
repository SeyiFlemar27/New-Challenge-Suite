import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/api/dashboard/route.ts");
const viewer = read("lib/server/challenge-viewer-state.ts");
const page = read("app/my-entries/page.tsx");
assert(dashboard.includes("personalChallengeFields") && dashboard.includes("relationship"), "dashboard entries must include challenge relationship context");
assert(viewer.includes("nextAction") && viewer.includes("PAY_ENTRY_FEE") && viewer.includes("SUBMIT_ENTRY") && viewer.includes("VIEW_ENTRY"), "viewer state must provide next-action vocabulary");
assert(page.includes("View Challenge"), "My Entries card must offer a next navigation action");
console.log("My Entries next action state checks passed");