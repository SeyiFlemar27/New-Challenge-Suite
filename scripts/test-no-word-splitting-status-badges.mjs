import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const detail = read("app/challenges/[id]/page.tsx");
assert(css.includes("word-break: normal") && css.includes("hyphens: none"));
assert(css.includes("[data-status-badge]") && css.includes("white-space: nowrap"));
assert(detail.includes("data-status-badge"));
assert(!css.includes("overflow-wrap: anywhere"));
console.log("status badge word wrapping checks passed");
