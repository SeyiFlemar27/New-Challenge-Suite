import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell = read("components/admin/admin-shell.tsx");
for (const group of ["Dashboard", "Action Centre", "People", "Challenges", "Money", "Safety & Support", "Sponsors & Events", "Communications", "Analytics & Content", "Settings", "Developer Tools"]) assert(shell.includes(`label: "${group}"`), `${group} group is required`);
assert(shell.lastIndexOf('label: "Developer Tools"') > shell.lastIndexOf('label: "Settings"'));
assert(shell.includes('bg-[#f4f5f7]') && shell.includes('bg-[#0c0c0c]'));
console.log("admin information architecture: ok");
