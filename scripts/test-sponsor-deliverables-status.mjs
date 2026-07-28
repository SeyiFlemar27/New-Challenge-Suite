import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const deliverables = read("app/api/sponsor/deliverables/route.ts");
const collaboration = read("lib/sponsor-collaboration.ts");
assert(deliverables.includes("sponsorDeliverables") && deliverables.includes("status"), "sponsor deliverables route must persist status records");
for (const status of ["pending", "active", "completed", "blocked", "cancelled"]) assert(collaboration.includes(status) || deliverables.includes(status), `deliverable status ${status} must be represented`);
assert(deliverables.includes("paymentReleaseStatus: \"not_active\""), "deliverable approval must not release payment");
console.log("sponsor deliverables status checks passed");