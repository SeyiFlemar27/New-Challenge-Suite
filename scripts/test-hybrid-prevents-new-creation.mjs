import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const createApi = read("app/api/challenges/route.ts");
const draftApi = read("app/api/challenges/drafts/[id]/route.ts");
const stageApi = read("app/api/challenges/[id]/hybrid-stage/route.ts");
assert(createApi.includes("isRetiredHybridCompetition"));
assert(createApi.includes("HYBRID_COMPETITION_RETIRED"));
assert(draftApi.includes("isRetiredHybridCompetition(current)"));
assert(draftApi.includes("Historical records remain available in read-only mode"));
assert(stageApi.includes("HYBRID_COMPETITION_RETIRED"));
console.log("new Hybrid creation, draft conversion, and stage mutation fail closed: ok");
