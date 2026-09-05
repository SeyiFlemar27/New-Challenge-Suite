import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
const host = read("app/dashboard/host/page.tsx");
assert(sidebar.includes('pathname === "/dashboard/host"'));
assert(sidebar.includes('context === "host" && capabilities.canManageHostOperations'));
assert(sidebar.includes('hostContext ? "Host Control Center"'));
assert(host.includes('title="Host Control Center"'));
console.log("host dashboard uses host navigation: ok");
