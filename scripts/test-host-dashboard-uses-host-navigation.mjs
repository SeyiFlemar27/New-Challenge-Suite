import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
const host = read("app/dashboard/host/page.tsx");
assert(sidebar.includes('pathname === "/dashboard/host"'));
assert(sidebar.includes('if (context === "host") return hostSections'));
assert(sidebar.includes('{ name: "Host Control Center", homeHref: "/dashboard/host" }'));
assert(host.includes("Host Control Center"));
console.log("host dashboard uses host navigation: ok");
