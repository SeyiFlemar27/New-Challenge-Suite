import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('if (context === "admin") return isAdmin ? adminSections : []'));
assert(sidebar.includes('return personalSections(capabilities, context, dashboardName)'));
assert(sidebar.includes('context === "host" && capabilities.canManageHostOperations'));
assert(sidebar.includes('if (context === "sponsor") return sponsorSections'));
assert(!sidebar.includes("user?.isAdmin ? adminSections"));
console.log("global admin navigation is restricted to verified admin context: ok");
