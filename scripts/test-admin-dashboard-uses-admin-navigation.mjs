import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
const adminShell = read("components/admin/admin-shell.tsx");
assert(sidebar.includes('pathname === "/admin" || pathname.startsWith("/admin/")'));
assert(sidebar.includes('if (context === "admin") return isAdmin ? adminSections : []'));
assert(adminShell.includes('"/api/admin/access"'));
assert(adminShell.includes('access === "denied"'));
console.log("admin dashboard uses verified admin navigation: ok");
