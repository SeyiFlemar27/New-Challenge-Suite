import assert from "node:assert/strict";
import { exists, read } from "./production-flow-test-utils.mjs";

assert(exists("app/challenges/[id]/layout.tsx"));
assert(exists("app/tournaments/[id]/results/layout.tsx"));
const challenge = read("app/challenges/[id]/layout.tsx");
const results = read("app/tournaments/[id]/results/layout.tsx");
assert(challenge.includes("generateMetadata") && challenge.includes("openGraph") && challenge.includes("twitter"));
assert(challenge.includes('visibility !== "public"'));
assert(results.includes("generateMetadata") && results.includes("Tournament Results"));
assert(results.includes("/results"));
console.log("Challenge and results share metadata checks passed.");
