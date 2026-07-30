import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('if (context === "sponsor") return sponsorSections'));
assert(sidebar.includes('if (context === "sponsor") return { name: "Sponsor Dashboard", homeHref: "/sponsor/dashboard" }'));
assert(!sidebar.includes("user?.isAdmin ? adminSections"));
console.log("sponsor content cannot receive the shared admin sidebar: ok");
