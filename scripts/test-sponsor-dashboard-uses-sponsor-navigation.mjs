import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
const routing = read("lib/workspace-routing.ts");
const sponsorShell = read("components/sponsor/sponsor-shell.tsx");
assert(sidebar.includes("workspaceForRoute(pathname, activeWorkspace, availableWorkspaces)"));
assert(routing.includes('{ surface: "Sponsor workspace"') && routing.includes('requiredWorkspace: "sponsor"'));
assert(sidebar.includes('if (context === "sponsor") return sponsorSections'));
for (const label of ["Sponsor Dashboard", "Campaigns", "Sponsor Reports", "Wallet & Payments"]) {
  assert(sidebar.includes(label), label);
}
assert(sponsorShell.includes("SponsorShell"));
console.log("sponsor dashboard uses sponsor navigation: ok");
