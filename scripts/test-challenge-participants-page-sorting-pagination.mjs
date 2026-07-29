import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/participants/page.tsx");
const helper = read("lib/server/challenge-participants.ts");
assert(page.includes('"highest_votes"') && page.includes("Highest votes"));
assert(page.includes("Search participants or entries"));
assert(page.includes("Previous") && page.includes("Next"));
assert(helper.includes("pageSize") && helper.includes("hasMore"));
console.log("participants sorting and pagination checks passed");
