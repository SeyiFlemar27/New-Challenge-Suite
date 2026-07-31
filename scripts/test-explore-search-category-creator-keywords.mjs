import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/explore/challenges/route.ts");
for (const field of ["raw.title", "raw.creatorName", "raw.category", "raw.keywords", "raw.tags"]) assert(api.includes(field), field);
assert(api.includes("searchable.includes"));
console.log("Explore search covers title, creator, category, keywords, and tags: ok");
