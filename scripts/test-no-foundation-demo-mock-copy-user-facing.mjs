import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const coreUi = [
  "app/challenges/[id]/page.tsx",
  "app/challenges/[id]/join/page.tsx",
  "app/challenges/[id]/participants/page.tsx",
  "app/challenges/[id]/prediction/page.tsx",
  "app/explore/page.tsx",
  "app/wallet/withdraw/page.tsx",
  "app/sponsor/dashboard/page.tsx",
  "components/admin/admin-control-center.tsx",
  "components/host/host-competition-wizard.tsx"
].map((file) => read(file).replace(/^import .*$/gm, "")).join("\n");
assert(!/\b(?:foundation|demo|mock)\b/i.test(coreUi));
console.log("Core production-copy checks passed.");
