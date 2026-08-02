import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const primary = [read("components/admin/admin-shell.tsx"), read("components/admin/admin-control-center.tsx"), read("app/api/admin/operations/route.ts")].join("\n");
assert(!primary.includes("Admin Command Center"));
assert(!primary.includes("Admin command data"));
assert(!primary.includes("foundation"));
assert(primary.includes("Current availability") && primary.includes("What happens next"));
console.log("admin primary copy uses plain operational language: ok");
