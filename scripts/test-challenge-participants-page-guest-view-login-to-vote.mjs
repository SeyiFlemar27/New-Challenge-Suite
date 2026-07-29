import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api = read("app/api/challenges/[id]/participants/route.ts");
const card = read("components/challenge-participant-card.tsx");
assert(api.includes("getOptionalRequestUser"));
assert(api.includes("isPublicChallenge"));
assert(api.includes('"auth_required"'));
assert(card.includes("Log in to Vote") && card.includes("encodeURIComponent(returnPath)"));
console.log("guest participant viewing and login continuation checks passed");
