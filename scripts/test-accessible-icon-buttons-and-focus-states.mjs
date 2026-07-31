import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const sidebar = read("components/sidebar.tsx");
const shell = read("components/app-shell.tsx");
assert(css.includes(":focus-visible") && css.includes("outline-offset: 3px"));
for (const label of ["Open navigation menu", "Close navigation menu", "Open profile"]) assert(sidebar.includes(label));
assert(shell.includes("Skip to Main Content") && shell.includes('id="main-content"'));
console.log("icon button and focus-state checks passed");
