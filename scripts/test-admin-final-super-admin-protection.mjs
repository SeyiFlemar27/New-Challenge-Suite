import assert from "node:assert/strict";
import { canDeactivateAdministrator, ADMIN_ROLES } from "../lib/server/admin-permissions.ts";
assert.deepEqual(ADMIN_ROLES, ["admin"]);
assert.equal(canDeactivateAdministrator({ actorId: "actor", targetId: "target", activeAdminCount: 1 }).allowed, false, "the final Admin is protected from removal");
assert.equal(canDeactivateAdministrator({ actorId: "actor", targetId: "target", activeAdminCount: 2 }).allowed, true, "one of multiple Admins may be removed by an authorized manager");
assert.equal(canDeactivateAdministrator({ actorId: "actor", targetId: "actor", activeAdminCount: 2 }).allowed, false, "self-deactivation remains blocked");
console.log("PASS single Admin final-account and self-removal protection");
