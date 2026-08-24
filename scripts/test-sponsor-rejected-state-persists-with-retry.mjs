import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/sponsor/dashboard/page.tsx");
const access = read("lib/sponsor-access.ts");
assert(dashboard.includes("resolveSponsorWorkspaceState") && access.includes('status === "rejected"'));
assert(access.includes('nextActionLabel = "Review Decision"') && access.includes("contact support before resubmitting"));
console.log("sponsor rejected retry-state checks passed");
