import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/sponsor-reporting.ts"), page=read("app/sponsor/dashboard/page.tsx");
assert(helper.includes('roi: null') && page.includes('label="ROI" value="Not tracked yet"'));
assert(!/roi:\s*[1-9]/i.test(helper));
console.log("Phase 7 no fake ROI checks passed.");