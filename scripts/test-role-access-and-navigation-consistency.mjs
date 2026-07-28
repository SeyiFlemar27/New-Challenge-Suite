import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const sidebar = read("components/sidebar.tsx");
const auth = read("lib/server/auth.ts");
const viewer = read("lib/server/challenge-viewer-state.ts");
assert(sidebar.includes("/challenges") && sidebar.includes("/explore") && sidebar.includes("/my-entries"), "navigation must include Challenges, Explore, and My Entries");
assert(!sidebar.includes("label: \"My Challenges\"") && !sidebar.includes("label: \"Create Challenge\""), "sidebar must not restore visible My Challenges or global Create Challenge items");
assert(auth.includes("requireAdminUser") && viewer.includes("self_entry_not_allowed") && viewer.includes("sponsor_blocked"), "role access and participation blockers must exist server-side");
console.log("role access and navigation consistency checks passed");