import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const topbar = read("components/authenticated-topbar.tsx");
assert(topbar.includes("Switch Role"));
assert(!topbar.includes("Switch Dashboard"));
assert(topbar.includes("user.isAdmin") && topbar.includes("user.isSponsor"));
console.log("avatar dropdown uses role-aware Switch Role wording: ok");
