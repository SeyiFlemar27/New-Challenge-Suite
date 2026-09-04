import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell = read("components/admin/admin-shell.tsx");
for (const group of ["Overview", "People", "Challenges", "Finance", "Sponsors", "Rewards", "Safety & Support", "Content", "Platform", "System"]) assert(shell.includes(`label: "${group}"`), `${group} group is required`);
for (const route of ["/admin/action-centre", "/admin/people/users", "/admin/kyc", "/admin/review", "/admin/refunds", "/admin/sponsor-operations", "/admin/rewards/prize-wheel", "/admin/rewards/prize-catalog", "/admin/rewards/fulfilment", "/admin/rewards/adjustments", "/admin/people/admin-team", "/admin/audit-logs"]) assert(shell.includes(`href: "${route}"`), `required Admin route is missing: ${route}`);
for (const duplicate of ['href: "/admin/events"', 'href: "/admin/tournaments"', 'href: "/admin/reports"', 'href: "/admin/chargebacks"', 'href: "/admin/rewards/campaigns"', 'href: "/admin/media-moderation"', 'href: "/admin/risk"', 'label: "Spin Credits"', 'label: "QA tools"']) assert(!shell.includes(duplicate), `non-primary navigation remains: ${duplicate}`);
assert(shell.includes("accessDetails?.permissions.includes(item.permission)"));
console.log("admin information architecture: ok");
