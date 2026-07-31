import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/explore/page.tsx");
const api = read("app/api/explore/challenges/route.ts");
assert(!page.includes("Hybrid Competition"));
assert(api.includes("isPublicChallenge"));
assert(read("lib/server/public-challenge.ts").includes("isRetiredHybridCompetition(data)"));
console.log("Explore has no Hybrid filter and retired records are filtered server-side: ok");
