import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/challenges/[id]/manage/route.ts");
const page = read("app/challenges/[id]/manage/page.tsx");
assert(route.includes('"challengeSettlements"') && route.includes("settlements"));
assert(page.includes("data.settlements.map") && page.includes("Internal settlement history"));
console.log("management settlement visibility checks passed");
