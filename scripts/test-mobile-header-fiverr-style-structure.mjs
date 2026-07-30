import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/sidebar.tsx");
assert(source.includes("data-mobile-header"));
assert(source.includes("grid-cols-[44px_minmax(0,1fr)_44px]"));
assert(source.includes("Challenge Suite"));
assert(source.includes("signedOut ?"));
console.log("mobile header structure: ok");
