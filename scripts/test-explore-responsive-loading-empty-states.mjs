import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
assert(page.includes("animate-pulse"), "loading state required");
assert(page.includes("No challenges found"), "empty state required");
assert(page.includes("Explore could not load"), "error state required");
assert(page.includes("Load more challenges"), "load more control required");
console.log("explore responsive loading empty state checks passed");