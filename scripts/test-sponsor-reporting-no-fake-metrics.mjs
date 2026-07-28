import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
for (const file of ["app/api/sponsor/reports/route.ts", "app/api/sponsor/analytics/route.ts", "app/sponsor/dashboard/page.tsx"]) {
  const text = read(file);
  assert(!text.includes("fake") && !text.includes("mock"), `${file} must not use fake sponsor metrics`);
}
console.log("sponsor reporting no fake metrics checks passed");