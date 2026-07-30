import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('if (context === "host") return hostSections'));
assert(sidebar.includes('if (context === "host") return { name: "Host Control Center", homeHref: "/dashboard/host" }'));
assert(!sidebar.includes("user?.isAdmin ? adminSections"));
console.log("host content cannot receive the shared admin sidebar: ok");
