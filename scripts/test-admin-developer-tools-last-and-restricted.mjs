import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell = read("components/admin/admin-shell.tsx");
const access = read("app/api/admin/access/route.ts");
assert(shell.lastIndexOf('label: "Developer Tools"') > shell.lastIndexOf('label: "Settings"'));
assert(shell.includes("item.developerOnly") && shell.includes("accessDetails.developerToolsAvailable"));
assert(access.includes('process.env.NODE_ENV !== "production"'));
assert(access.includes('includes("developerTools.view")'));
console.log("developer tools are last and restricted: ok");
