import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell = read("components/admin/admin-shell.tsx");
for (const group of ["Overview", "People", "Challenges", "Finance", "Sponsors", "Rewards", "Safety & Support", "Content", "Platform", "System"]) assert(shell.includes(`label: "${group}"`), `${group} group is required`);
for (const duplicate of ['href: "/admin/events"', 'href: "/admin/tournaments"', 'href: "/admin/reports"', 'label: "Spin Credits"', 'label: "QA tools"']) assert(!shell.includes(duplicate), `obsolete navigation remains: ${duplicate}`);
assert(shell.includes("accessDetails?.permissions.includes(item.permission)"));
console.log("admin information architecture: ok");
