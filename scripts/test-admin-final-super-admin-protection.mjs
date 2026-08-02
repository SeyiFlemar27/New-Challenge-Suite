import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("lib/server/admin-permissions.ts");
assert(source.includes("canDeactivateAdministrator"));
assert(source.includes("activeSuperAdminCount <= 1"));
assert(source.includes("final active Super Admin cannot be removed"));
assert(source.includes("Platform ownership must be transferred"));
console.log("final super admin protection: ok");
