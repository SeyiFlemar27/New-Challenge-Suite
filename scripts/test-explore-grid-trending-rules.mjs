import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const explore = readFileSync(join(process.cwd(), "app/explore/page.tsx"), "utf8");

assert(explore.includes("trendingChallenges"), "Explore must derive a dedicated trending challenge list.");
assert(explore.includes("participantCount >= 100"), "Trending must require at least 100 real participants.");
assert(explore.includes("getChallengeLifecycleState"), "Trending must use lifecycle state.");
assert(explore.includes("openOrActive") && explore.includes("recent"), "Trending must require active/open/recent state.");
assert(explore.includes("TrendingStories challenges={trendingChallenges}"), "Trending stories must receive only eligible trending challenges.");
assert(explore.includes("Public Challenge Grid") && explore.includes("ExploreChallengeCard"), "Explore must render a real challenge grid.");
assert(explore.includes("ChallengeMediaFrame") && explore.includes("placeholder=\"Challenge Suite\""), "Explore cards must render stable media placeholders.");
assert(!explore.includes("fake prize") && !explore.includes("mock"), "Explore must not add fake challenge data.");

console.log("Explore grid and trending rule checks passed.");
