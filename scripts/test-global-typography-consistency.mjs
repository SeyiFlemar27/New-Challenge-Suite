import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const ui = read("components/ui.tsx");
assert(css.includes(":where(h1, h2, h3)") && css.includes("text-transform: capitalize"));
assert(css.includes("[data-ui-button]") && ui.includes("data-ui-button"));
assert(ui.includes("text-sm font-bold") && ui.includes("text-3xl font-black"));
console.log("global typography hierarchy checks passed");
