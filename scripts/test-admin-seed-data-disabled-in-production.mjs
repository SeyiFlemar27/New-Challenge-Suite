import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/admin/qa-data/route.ts");
const shell = read("components/admin/admin-shell.tsx");
assert(route.includes('process.env.NODE_ENV === "production"'));
assert(route.includes("QA_TOOLS_DISABLED"));
assert(route.includes('requireAdminPermission(request, "qaTools.use")'));
assert(shell.includes("developerToolsAvailable"));
console.log("admin seed data is disabled in production: ok");
