import assert from "node:assert/strict";
import { ADMIN_ROLES, resolveAdminPermissions, normalizeAdminRoleAssignments } from "../lib/server/admin-permissions.ts";
assert.deepEqual(ADMIN_ROLES, ["admin"], "only the canonical Admin role is assignable");
assert.deepEqual(normalizeAdminRoleAssignments(["support_admin", "finance_admin"]), ["admin"], "legacy assigned roles normalize to one Admin identity");
const support = resolveAdminPermissions(["support_admin"]);
assert.ok(support.includes("tickets.resolve"), "legacy support access is retained as a permission");
assert.ok(!support.includes("refunds.execute"), "legacy support access does not gain financial permissions");
assert.ok(resolveAdminPermissions(["finance_admin"]).includes("refunds.execute"), "legacy finance permission is retained during migration");
console.log("PASS single Admin role and legacy permission compatibility");
