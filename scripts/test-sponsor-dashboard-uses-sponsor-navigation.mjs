import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const routing = read("lib/workspace-routing.ts");
const sponsorShell = read("components/sponsor/sponsor-shell.tsx");
assert(routing.includes('{ surface: "Sponsor panel"') && routing.includes('semantics: "sponsor", requiredWorkspace: null'));
assert(!sponsorShell.includes("WorkspaceSwitcher"));
for (const label of ["Sponsor Studio", "Discover", "Saved", "Sponsorships", "Proposals", "Deliverables", "Analytics", "Reports", "Wallet", "Settings", "Support"]) assert(sponsorShell.includes(label), label);
assert(!sponsorShell.includes('label: "Campaigns"'));
console.log("sponsor dashboard uses dedicated sponsor navigation: ok");