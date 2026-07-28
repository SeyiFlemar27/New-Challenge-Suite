import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const helper=read("lib/server/advanced-competitions.ts");
assert(helper.includes('/tournaments/${id}') && helper.includes('/live-events/${id}/register') && helper.includes('/challenges/${id}'));
console.log("Phase 8 advanced type routing checks passed.");