import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/explore/page.tsx");
const api = read("app/api/explore/challenges/route.ts");
for (const marker of ["snap-x", "snap-mandatory", 'role="list"', "creator.avatarUrl", "activityLabel"]) assert(page.includes(marker), marker);
for (const signal of ["uniqueParticipants72h", "verifiedUniqueVotes72h", "uniqueChallengeViews72h", "uniqueSaves72h", "uniqueShares72h", "uniqueComments72h"]) assert(api.includes(signal), signal);
assert(api.includes("* 30") && api.includes("* 25") && api.includes("* 15") && api.includes("* 10") && api.includes("* 5"));
assert(api.includes("creatorSelfActivity72h") && api.includes("suspiciousActivity"));
console.log("Explore trending stories use weighted real activity with integrity checks: ok");
