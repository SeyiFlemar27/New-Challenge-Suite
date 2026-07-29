import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("/participants"));
assert(page.includes("See all participants"));
console.log("challenge detail participant link checks passed");
