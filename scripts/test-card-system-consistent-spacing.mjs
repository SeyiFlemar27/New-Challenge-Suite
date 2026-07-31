import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const ui = read("components/ui.tsx");
const css = read("app/globals.css");
assert(ui.includes("data-ui-card") && ui.includes("rounded-[8px]") && ui.includes("border-white/10"));
assert(css.includes("[data-ui-card] > :first-child"));
console.log("shared card system checks passed");
