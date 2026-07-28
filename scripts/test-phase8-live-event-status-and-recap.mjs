import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const list=read("app/api/live-events/route.ts"), detail=read("app/api/live-events/[id]/route.ts");
assert(list.includes('timezone') || detail.includes('timezone'));
assert(detail.includes('recapSummary') && detail.includes('recapMedia') && detail.includes('checkInCount'));
assert(list.includes('deleted') && list.includes('cancelled'));
console.log("Phase 8 live event status and recap checks passed.");