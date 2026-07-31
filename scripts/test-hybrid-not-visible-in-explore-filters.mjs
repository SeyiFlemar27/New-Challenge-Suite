import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const publicChallenge = read("lib/server/public-challenge.ts");
const exploreApi = read("app/api/explore/challenges/route.ts");
const explorePage = read("app/explore/page.tsx");
assert(publicChallenge.includes("isRetiredHybridCompetition(data)"));
assert(exploreApi.includes("isPublicChallenge"));
assert(!explorePage.includes("Hybrid Competition"));
console.log("retired Hybrid records cannot enter Explore results or filters: ok");
