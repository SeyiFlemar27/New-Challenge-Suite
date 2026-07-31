import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/prize-pools.ts");
const detail = read("app/challenges/[id]/page.tsx");
assert(helper.includes("visibleJackpotCents * Number(split.percent") && helper.includes("expectedAmountCents"));
for (const copy of ["1st place", "2nd place", "3rd place", "Prize amount", "Estimated prize"]) assert(detail.includes(copy));
assert(!detail.includes("expected $0"));
console.log("calculated public prize amount checks passed");
