import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api = read("app/api/challenges/[id]/route.ts");
const page = read("app/challenges/[id]/page.tsx");
assert(api.includes("pageSize: 5") && api.includes("topParticipants"));
assert(page.includes("Audience Rankings") && page.includes("topParticipants.map"));
assert(!page.includes("ChallengeParticipantCard"), "compact preview must not render full participant cards");
assert(page.includes("View Full Leaderboard"));
console.log("challenge detail top-five preview checks passed");
