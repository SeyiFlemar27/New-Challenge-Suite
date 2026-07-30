import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/wallet/page.tsx");
for (const label of ["Challenge winner prize", "Sponsor-funded prize", "Prediction reward", "Creator earning"]) assert(page.includes(label), `missing wallet source label: ${label}`);
assert(page.includes("Gross") && page.includes("Platform fee") && page.includes("Net credited"));
console.log("wallet settlement source line checks passed");
