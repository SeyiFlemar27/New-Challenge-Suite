import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/admin/public-content/route.ts");
assert(route.includes('requireAdminPermission(request,"content.preview")'));
assert(route.includes('requireAdminPermission(request,"content.publish")'));
assert(route.includes("publicSiteConfigVersions"));
assert(route.includes("writeAuditLog"));
console.log("admin public website content lifecycle: ok");
