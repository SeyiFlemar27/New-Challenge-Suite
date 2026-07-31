import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/explore/challenges/route.ts");
for (const label of ["Manage Challenge", "Join Challenge", "Continue Challenge", "Vote Now", "View Winners", "View Results", "View Challenge"]) assert(api.includes(label), label);
assert(api.includes("participantByChallenge.get(doc.id)"));
assert(api.includes("reason: input.phase.label"));
console.log("Explore CTAs cover viewer participation and canonical lifecycle states: ok");
