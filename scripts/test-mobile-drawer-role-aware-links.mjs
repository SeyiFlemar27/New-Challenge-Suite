import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/sidebar.tsx");
for (const marker of ["guestSections", "adminSections", "creatorSections", "sponsorSections", "Logout", "Create Challenge", "Sponsor Dashboard", "Admin Dashboard"]) assert(source.includes(marker), marker);
assert(source.includes('if (context === "admin") return isAdmin ? adminSections : []'));
assert(!source.includes("user?.isAdmin ? adminSections"));
console.log("role-aware mobile drawer: ok");
