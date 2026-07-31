import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const retiredPage = read("app/hybrid/page.tsx");
const archivePage = read("app/host/hybrid/page.tsx");
assert(retiredPage.includes("Competition Format Retired"));
assert(retiredPage.includes("Historical records remain preserved"));
assert(retiredPage.includes('href="/explore"'));
assert(archivePage.includes("Historical Hybrid Competition records remain available"));
console.log("legacy Hybrid links resolve to safe retirement and archive states: ok");
