import assert from "node:assert/strict";
import { exists, read } from "./production-flow-test-utils.mjs";

assert(exists("app/api/events/[id]/registrations/route.ts"));
assert(exists("app/api/live-events/[id]/check-in/route.ts"));
const registration = read("app/api/events/[id]/registrations/route.ts");
const checkIn = read("app/api/live-events/[id]/check-in/route.ts");
const detail = read("app/api/live-events/[id]/route.ts");

assert(registration.includes("currentAttending >= currentCapacity"));
assert(registration.includes("runTransaction"));
assert(registration.includes("Paid live event checkout is not configured yet."));
assert(checkIn.includes("liveEventRegistrations"));
assert(detail.includes("checkInCount"));
console.log("Live event registration and check-in checks passed.");
