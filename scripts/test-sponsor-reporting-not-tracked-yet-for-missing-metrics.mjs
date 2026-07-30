import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const reporting = read("lib/server/sponsor-reporting.ts");
for (const metric of ["trackedImpressions: null", "trackedClicks: null", "trackedConversions: null", "roi: null"]) assert(reporting.includes(metric), `missing ${metric}`);
assert(reporting.includes('"not_tracked_yet"'));
console.log("sponsor missing metric labeling checks passed");
