import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const adminShell = read("components/admin/admin-shell.tsx");
const accessRoute = read("app/api/admin/access/route.ts");
const auth = read("lib/server/auth.ts");
assert(adminShell.includes('"/api/admin/access"'));
assert(adminShell.includes('access === "denied"'));
assert(accessRoute.includes("requireAdminUser"));
assert(auth.includes("requireAdminUser"));
console.log("admin route protection remains server enforced: ok");
