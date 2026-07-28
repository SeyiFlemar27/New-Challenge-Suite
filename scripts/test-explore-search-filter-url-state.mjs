import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
assert(page.includes("URLSearchParams"), "Explore must use URL query state");
for (const key of ["q", "category", "phase", "entry", "sort", "page"]) assert(page.includes(`params.set("${key}"`) || page.includes(`params.get("${key}"`), `${key} URL state missing`);
console.log("explore search filter URL state checks passed");