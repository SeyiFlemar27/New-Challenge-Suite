import assert from "node:assert/strict";
import { exists, read } from "./production-flow-test-utils.mjs";
const list = read("app/api/winners/route.ts");
const detail = read("app/api/winners/[id]/route.ts");
assert(exists("app/winners/page.tsx") && exists("app/winners/[id]/page.tsx"));
assert(list.includes('["announced", "paid"]') && detail.includes('["announced", "paid"]'));
assert(!list.includes("derived") && !detail.includes("deriveSafePreviewWinners"));
console.log("phase4 announced winner results checks passed");