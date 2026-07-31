import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const shell = read("components/app-shell.tsx");
for (const path of ["app/explore/page.tsx", "app/challenges/[id]/page.tsx", "app/challenges/[id]/prediction/page.tsx", "app/earnings/page.tsx", "app/dorocoins/page.tsx"]) {
  const page = read(path);
  assert(page.includes("AppShell"), `${path} must use the responsive app shell`);
}
assert(css.includes("overflow-x: clip") && shell.includes("overflow-x-hidden"));
assert(css.includes("mobile-dashboard-table") && css.includes("display: block"));
console.log("core-page responsive overflow checks passed");
