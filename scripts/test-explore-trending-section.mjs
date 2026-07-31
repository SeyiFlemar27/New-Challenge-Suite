import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(page.includes("Trending Challenges") && !page.includes("Featured challenges"), "Featured section must be renamed to Trending Challenges");
assert(api.includes("trustedRecentActivity") && api.includes("participantCount") && api.includes("voteCount") && api.includes("saveCount"), "trending must use real-data scoring signals");
assert(!api.includes(">= 100"), "trending must not require 100 participants");
assert(api.includes("trending") && api.includes("defaultClosedExcluded"), "API must return real trending records after default exclusions");
console.log("explore trending section checks passed");
