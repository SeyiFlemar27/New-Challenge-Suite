import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const sidebar = read("components/sidebar.tsx");
const topbar = read("components/authenticated-topbar.tsx");
assert(!sidebar.includes("<PremiumBadge"));
assert(!sidebar.includes("Profile unavailable"));
assert(topbar.includes("View Profile"));
console.log("sidebar profile block moved to topbar account menu: ok");
