import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const permissions = read("lib/server/admin-permissions.ts");
const operations = read("app/api/admin/operations/route.ts");
const actionCentre = read("app/api/admin/action-centre/route.ts");
const cases = read("app/api/admin/cases/route.ts");
const reviews = read("app/api/admin/reviews/route.ts");
const shell = read("components/admin/admin-shell.tsx");
const workspace = read("components/admin/admin-phase2-workspace.tsx");
const rewardSettings = read("app/admin/rewards/settings/page.tsx");

for (const permission of [
  "admin.actionCentre.assign", "admin.actionCentre.manage", "admin.actionCentre.resolve", "admin.actionCentre.escalate",
  "participants.view", "winners.view", "appeals.manage", "safetyReports.manage", "rewards.fulfil"
]) assert(permissions.includes(`"${permission}"`), `missing explicit permission ${permission}`);

assert(operations.includes("permittedSnapshot(db, permissions"), "operations data must be gated before each collection query");
for (const boundary of [
  ['"withdrawals.review", "withdrawalRequests"', "withdrawals"],
  ['"auditLogs.viewRaw", "auditLogs"', "audit logs"],
  ['"finance.view", "cashLedger"', "cash ledger"],
  ['"users.requireVerification", "kycMetadata"', "KYC"],
  ['"sponsors.view", "sponsorProfiles"', "Sponsor"],
  ['"tickets.view", "supportTickets"', "Support"]
]) assert(operations.includes(boundary[0]), `${boundary[1]} query is not permission-gated`);
assert(operations.includes("balances ? { doroCoinBalance"), "user financial fields must be omitted without Finance access");

assert(actionCentre.includes("visibleSources = sources.filter"), "Action Centre source queries must be domain-permission scoped");
assert(actionCentre.includes("lastSourceRefreshAt") && actionCentre.includes("sourceStatus"), "source refresh metadata must remain separate");
assert(!actionCentre.includes('reason: `Source record is ${status.replaceAll("_", " ")}.`, state: "unassigned"'), "materialization must not reset workflow state");
for (const permission of ["admin.actionCentre.assign", "admin.actionCentre.manage", "admin.actionCentre.resolve", "admin.actionCentre.escalate"]) assert(actionCentre.includes(permission));

assert(cases.includes("mutationPermission("), "case mutation permission mapping is required");
for (const permission of ["tickets.assign", "tickets.resolve", "disputes.decide", "appeals.manage", "safetyReports.manage", "reportedMessages.view"]) assert(cases.includes(permission));
assert(reviews.includes('hasAdminPermission(user?.adminPermissions, "finance.view")'), "mixed Review Queue must gate Finance queries at the query boundary");
assert(reviews.includes("permissionByType"), "Review Queue mutations must use type-specific permissions");

for (const group of ["Overview", "People", "Challenges", "Finance", "Sponsors", "Rewards", "Safety & Support", "Content", "Platform", "System"]) assert(shell.includes(`label: "${group}"`), `missing Admin navigation group ${group}`);
for (const stale of ['label: "Money"', 'label: "Sponsors & Events"', 'label: "Communications"', 'label: "Analytics & Content"', 'label: "Developer Tools"', 'label: "Spin Credits"', 'label: "QA tools"', 'label: "Feature readiness"']) assert(!shell.includes(stale), `stale Admin navigation remains: ${stale}`);
assert(!shell.includes('href: "/admin/events"') && !shell.includes('href: "/admin/tournaments"') && !shell.includes('href: "/admin/reports"'), "Events, Tournaments, and generic Reports must not be top-level Admin navigation");
assert(shell.includes("environmentLabel") && shell.includes("MFA is not currently verified"), "environment and truthful MFA state must be visible");

for (const child of [
  "app/admin/sponsor-operations/page.tsx", "app/admin/rewards/adjustments/page.tsx", "app/admin/rewards/campaigns/page.tsx",
  "app/admin/rewards/fulfilment/page.tsx", "app/admin/rewards/prize-wheel/page.tsx", "app/admin/rewards/settings/page.tsx",
  "app/admin/developer-tools/economy-rules/page.tsx"
]) assert(!read(child).includes("AdminShell"), `${child} must use the root Admin layout shell`);

assert(!workspace.includes("window.prompt(") && !workspace.includes("window.confirm("), "Admin operational decisions require structured dialogs");
assert(workspace.includes('role="dialog"') && workspace.includes("Required reason"), "Action Centre needs an accessible reason dialog");
assert(!workspace.toLowerCase().includes("@gmail.com") && !workspace.includes("Anjola Samuel"), "personal support identities must not be hardcoded");
assert(!rewardSettings.includes("Daily spin limit") && !rewardSettings.includes("maxSpinsPerDay"), "obsolete daily Spin allowance control must not be exposed");

const exactRewardRoutes = [
  ["app/api/admin/rewards/campaigns/route.ts", "rewards.configure"],
  ["app/api/admin/rewards/claims/route.ts", "rewards.fulfil"],
  ["app/api/admin/rewards/spins/route.ts", "rewards.investigate"],
  ["app/api/admin/rewards/prizes/route.ts", "rewards.configure"],
  ["app/api/admin/rewards/fulfilments/[fulfilmentId]/route.ts", "rewards.fulfil"]
];
for (const [path, permission] of exactRewardRoutes) {
  const source = read(path);
  assert(!source.includes("requireAdminUser(request)"), `${path} still accepts any Admin`);
  assert(source.includes(permission), `${path} lacks ${permission}`);
}

console.log("admin console launch readiness contracts: ok");
