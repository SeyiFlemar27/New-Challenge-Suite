import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
const dashboard = read("app/sponsor/dashboard/page.tsx");
assert(reporting.includes("roi: null") && reporting.includes('roi: "not_tracked_yet"'));
assert(dashboard.includes('value="Not tracked yet"'));
console.log("sponsor dashboard no-fake ROI checks passed");
