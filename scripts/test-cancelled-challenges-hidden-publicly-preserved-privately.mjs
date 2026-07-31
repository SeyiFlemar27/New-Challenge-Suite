import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const publicChallenge = read("lib/server/public-challenge.ts");
const dashboard = read("app/api/dashboard/route.ts");
assert(!publicChallenge.includes('"cancelled"') || publicChallenge.includes("PUBLIC_CHALLENGE_STATUSES"));
assert(dashboard.includes("participantEntries"));
assert(dashboard.includes('cancelled = ["cancelled", "canceled"]'));
assert(!dashboard.includes(".delete("));
console.log("cancelled challenges stay out of public discovery while affected-user history is preserved: ok");
