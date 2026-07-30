import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/sidebar.tsx");
assert(source.includes("lg:hidden"));
assert(source.includes("hidden") && source.includes("lg:flex"));
assert(source.includes('aria-label="Open navigation menu"'));
assert(source.includes('role="dialog"'));
console.log("mobile sidebar and drawer: ok");
