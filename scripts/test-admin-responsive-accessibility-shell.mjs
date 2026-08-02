import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/admin/admin-shell.tsx");
assert(source.includes('role="dialog"') && source.includes('aria-modal="true"'));
assert(source.includes('event.key === "Escape"') && source.includes('event.key !== "Tab"'));
assert(source.includes("prior?.focus()"));
assert(source.includes("Skip to admin workspace"));
assert(source.includes("overflow-x-hidden"));
console.log("admin responsive accessibility shell: ok");
