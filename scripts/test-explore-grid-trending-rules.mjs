import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const explore = readFileSync(join(process.cwd(), "app/explore/page.tsx"), "utf8");
const api = readFileSync(join(process.cwd(), "app/api/explore/challenges/route.ts"), "utf8");

assert(explore.includes("const trending = data?.trending"), "Explore must use a dedicated server-ranked trending list.");
assert(!api.includes("participantCount >= 100"), "Trending must support real low-volume activity.");
assert(api.includes("trustedRecentActivity") && api.includes("isDefaultDiscoverable"), "Trending must use trusted activity and lifecycle filtering.");
assert(explore.includes("TrendingCard") && explore.includes('role="list"'), "Trending stories must receive only server-ranked challenges.");
assert(explore.includes("Browse") && explore.includes("ExploreChallengeCard"), "Explore must render a real challenge grid.");
assert(explore.includes("ChallengeMediaFrame") && explore.includes("placeholder=\"Challenge Suite\""), "Explore cards must render stable media placeholders.");
assert(!explore.includes("fake prize") && !explore.includes("mock"), "Explore must not add fake challenge data.");

console.log("Explore grid and trending rule checks passed.");

