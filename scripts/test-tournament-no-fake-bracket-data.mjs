import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const route = read("app/api/tournaments/[id]/bracket/route.ts");
const operations = read("lib/server/tournament-operations.ts");

assert(route.includes('db.collection("tournamentParticipants")'));
assert(route.includes("seedParticipants(participants"));
assert(!/mock participant|fake participant|sample participant|placeholder winner/i.test(route));
assert(!/mock participant|fake participant|sample participant|placeholder winner/i.test(operations));
console.log("Tournament bracket real-data checks passed.");
