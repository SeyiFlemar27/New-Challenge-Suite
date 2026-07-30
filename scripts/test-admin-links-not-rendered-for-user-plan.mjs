import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes("return competitorSections"));
assert(sidebar.includes('if (context === "admin") return isAdmin ? adminSections : []'));
assert(!sidebar.includes("paid ? adminSections"));
console.log("user and paid plans are not treated as admin: ok");
