import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(!page.includes("Requires Review"));
assert(!page.includes('"Timeline needs review"'));
assert(page.includes("Schedule pending"));
console.log("challenge detail public warning copy checks passed");
