import assert from "node:assert/strict"; import { exists, read } from "./production-flow-test-utils.mjs";
assert(exists("app/tournaments/[id]/results/page.tsx")); const page=read("app/tournaments/[id]/results/page.tsx");
assert(page.includes('getTournamentBundle') && page.includes('bundle.placements') && page.includes('Results under review'));
console.log("Phase 8 tournament results page checks passed.");