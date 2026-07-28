import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
assert(page.includes("Challenge Suite"), "Challenge Suite header required");
assert(page.includes("Trending Challenges"), "trending strip required");
assert(page.includes("grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"), "responsive grid required");
assert(!/Fiverr|seller|gig|freelancer/i.test(page), "Explore must not copy Fiverr terminology");
console.log("explore marketplace page checks passed");
