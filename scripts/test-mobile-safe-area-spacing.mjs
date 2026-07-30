import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const pages = read("app/challenges/[id]/page.tsx") + read("app/challenges/[id]/votes/page.tsx") + read("app/challenges/[id]/prediction/page.tsx");
assert(css.includes("env(safe-area-inset-bottom)"));
assert(css.includes(".mobile-sticky-action"));
assert(pages.includes("mobile-sticky-action"));
console.log("mobile safe-area spacing: ok");
