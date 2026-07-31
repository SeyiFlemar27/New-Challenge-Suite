import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(!sidebar.includes('{ href: "/challenges/create", label: "Create Challenge"'));
assert(!sidebar.includes('label: "Alerts"'));
assert(!sidebar.includes("data-sidebar-profile"));
console.log("permanent create action, alerts, and profile block are absent from the sidebar: ok");
