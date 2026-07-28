import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/events/[id]/registrations/route.ts"), detail=read("app/api/live-events/[id]/route.ts");
assert(route.includes('liveEventRegistrations') && detail.includes('liveEventRegistrations'));
assert(route.includes('currentAttending >= currentCapacity') && route.includes('runTransaction'));
assert(route.includes('Event hosts cannot register') && route.includes('Sponsor accounts cannot register'));
assert(!detail.includes('Live event tools require the Host plan'));
console.log("Phase 8 live event capacity checks passed.");