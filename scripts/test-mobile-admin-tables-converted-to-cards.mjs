import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const shell = read("components/admin/admin-shell.tsx");
assert(shell.includes("admin-mobile-shell"));
assert(css.includes(".admin-mobile-shell table"));
assert(css.includes("display: block"));
assert(css.includes("min-width: 0 !important"));
console.log("mobile admin table cards: ok");
