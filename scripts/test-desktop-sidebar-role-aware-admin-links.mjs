import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes("sectionsForWorkspace(workspaceContext, user?.isAdmin === true"));
assert(sidebar.includes("<NavigationSections sections={sections} activeHref={activeHref} pathname={pathname} />"));
assert(!sidebar.includes("<NavigationSections sections={adminSections}"));
console.log("desktop sidebar uses role and route-aware sections: ok");
