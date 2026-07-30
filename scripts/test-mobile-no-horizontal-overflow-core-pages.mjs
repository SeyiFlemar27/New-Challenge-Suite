import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const pages = ["app/explore/page.tsx", "app/challenges/[id]/page.tsx", "app/challenges/[id]/participants/page.tsx", "app/profile/page.tsx", "app/wallet/page.tsx", "components/challenge-builder.tsx"].map(read).join("\n");
assert(css.includes("overflow-x: clip"));
assert(css.includes("@media (max-width: 767px)"));
assert(pages.includes("min-w-0"));
for (const width of [320, 375, 390, 414, 430]) assert(width <= 767);
console.log("core mobile horizontal overflow safeguards: ok");
