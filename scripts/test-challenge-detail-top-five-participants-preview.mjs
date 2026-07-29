import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api = read("app/api/challenges/[id]/route.ts");
const page = read("app/challenges/[id]/page.tsx");
assert(api.includes("pageSize: 5") && api.includes("topParticipants"));
assert(page.includes(".slice(0, 5)") && page.includes("Leading Participants"));
assert(page.includes("ChallengeParticipantCard"));
console.log("challenge detail top-five preview checks passed");
