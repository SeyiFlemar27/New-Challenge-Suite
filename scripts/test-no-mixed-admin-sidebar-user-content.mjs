import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('return "user"'));
assert(sidebar.includes("return sectionsForTier(tierId, sponsor)"));
assert(sidebar.includes('return { name: fallbackName, homeHref: "/dashboard" }'));
assert(!sidebar.includes("user?.isAdmin ? adminSections"));
console.log("user content cannot receive the shared admin sidebar: ok");
