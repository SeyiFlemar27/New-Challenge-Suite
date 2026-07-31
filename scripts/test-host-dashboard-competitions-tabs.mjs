import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
for (const tab of ['id: "active"', 'id: "upcoming"', 'id: "drafts"', 'id: "completed"']) assert(page.includes(tab), tab);
for (const field of ["participantCount(challenge)", "phase.phase", "nextDeadline(challenge)", "/manage"]) assert(page.includes(field), field);
assert(page.includes('role="tablist"') && page.includes('aria-selected={activeTab === tab.id}'));
console.log("host competitions use accessible status tabs and compact management rows: ok");
