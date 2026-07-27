import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const sidebar = readFileSync("components/sidebar.tsx", "utf8");
assert(!sidebar.includes('label: "My Challenges"'), "My Challenges must not be visible in sidebar");
assert(!sidebar.includes('label: "Create Challenge", icon'), "Create Challenge must not be visible in sidebar");
assert(sidebar.includes('{ href: "/challenges", label: "Challenges"'), "Challenges nav must point to /challenges");
assert(sidebar.includes('{ href: "/explore", label: "Explore"'), "Explore must remain in navigation");
assert(!sidebar.includes('Voting Control'), "Voting Control must not be global navigation");
console.log("navigation production cleanup checks passed");
