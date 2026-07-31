import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/retired-competitions.ts");
const archivePage = read("app/host/hybrid/page.tsx");
const stageApi = read("app/api/challenges/[id]/hybrid-stage/route.ts");
assert(helper.includes("preserveHistoricalRecords: true"));
assert(helper.includes('archiveReason: "format_discontinued"'));
assert(archivePage.includes("Archived Competition History"));
assert(stageApi.includes("preserveHistoricalRecords: true"));
assert(!stageApi.includes(".delete("));
console.log("historical Hybrid records are preserved in read-only archive state: ok");
