import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/earnings/page.tsx");
for (const label of ["Challenge winner prize", "Sponsor-funded prize", "Prediction reward", "Creator challenge earning"]) assert(page.includes(label), `missing earnings source label: ${label}`);
assert(page.includes("Gross") && page.includes("Platform fee") && page.includes("Net credited"));
console.log("wallet settlement source line checks passed");
