import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('if (context === "host") return hostSections'));
assert(sidebar.indexOf('if (context === "host") return hostSections') < sidebar.indexOf("return sectionsForTier(tierId, sponsor)"));
assert(!sidebar.includes('tierId === "host" ? adminSections'));
console.log("host plan is not treated as admin: ok");
