import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const list = read("app/api/winners/route.ts");
const detail = read("app/api/winners/[id]/route.ts");
assert(list.includes("winners_announced") && list.includes("completed"));
assert(detail.includes("winners_announced") && detail.includes("completed"));
console.log("phase4 permanent completed results checks passed");