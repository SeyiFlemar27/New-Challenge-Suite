import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("lib/server/admin-permissions.ts");
for (const role of ["platform_owner", "super_admin", "operations_admin", "finance_admin", "moderation_admin", "safety_admin", "support_admin", "sponsor_manager", "event_tournament_admin", "content_admin", "marketing_communications_admin", "analyst", "read_only_auditor", "technical_admin", "developer_support"]) assert(source.includes(`"${role}"`), `${role} missing`);
assert(source.includes("platform_owner: [...ADMIN_PERMISSIONS]") && source.includes("super_admin: [...ADMIN_PERMISSIONS]"));
assert(source.includes("resolveAdminPermissions"));
console.log("admin role catalog and inheritance: ok");
