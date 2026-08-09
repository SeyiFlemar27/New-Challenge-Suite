import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
assert(reporting.includes("roi: null") && reporting.includes('roi: "not_tracked_yet"'));
assert(!reporting.includes("estimatedRoi") && !reporting.includes("Math.random"));
assert(!read("app/sponsor/dashboard/page.tsx").includes("guaranteed ROI"));
console.log("sponsor dashboard no-fake ROI checks passed");
