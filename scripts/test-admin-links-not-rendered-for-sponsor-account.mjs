import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('if (context === "sponsor") return sponsorSections'));
assert(sidebar.includes("if (sponsor) return sponsorSections"));
assert(!sidebar.includes("sponsor ? adminSections"));
console.log("sponsor accounts are not treated as admin: ok");
