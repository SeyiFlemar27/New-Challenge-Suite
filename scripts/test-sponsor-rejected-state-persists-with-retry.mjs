import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/sponsor/dashboard/page.tsx");
assert(dashboard.includes('verificationStatus === "rejected"') && dashboard.includes("Brand profile changes required"));
assert(dashboard.includes("Continue Onboarding"));
console.log("sponsor rejected retry-state checks passed");
