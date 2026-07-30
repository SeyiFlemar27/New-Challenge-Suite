import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/profile/page.tsx") + read("components/social/public-profile.tsx");
assert(source.includes("data-mobile-profile-hero"));
assert(source.includes("items-center"));
assert(source.includes("text-center"));
assert(source.includes("data-mobile-profile-stats"));
for (const marker of ["Achievements", "Submissions", "Wins", "About"]) assert(source.includes(marker), marker);
console.log("mobile profile structure: ok");
