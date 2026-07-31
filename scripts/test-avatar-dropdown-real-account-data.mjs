import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const topbar = read("components/authenticated-topbar.tsx");
for (const marker of ["user.displayName", "user.email", "tier.memberLabel", "user.initials"]) assert(topbar.includes(marker), marker);
assert(!topbar.includes("Mock User"));
console.log("avatar dropdown uses real account data: ok");
