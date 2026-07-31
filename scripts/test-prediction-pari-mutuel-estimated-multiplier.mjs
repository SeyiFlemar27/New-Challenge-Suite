import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const page = read("app/challenges/[id]/prediction/page.tsx");
assert(helper.includes("predictionPoolEstimate") && helper.includes("participantPoolCents") && helper.includes("netPoolCents"));
for (const copy of ["Estimated Multiplier", "Estimated Return", "Current Pool Share", "Estimates change as new stakes are placed"]) assert(page.includes(copy));
assert(page.includes("not as a separate immediate fee"));
assert(!page.toLowerCase().includes("guaranteed odds"));
console.log("pari-mutuel estimate checks passed");
