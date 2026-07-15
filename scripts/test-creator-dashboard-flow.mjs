import { readFileSync, existsSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

const dashboard = read("app/dashboard/page.tsx");
const sidebar = read("components/sidebar.tsx");
const explore = read("app/explore/page.tsx");
const creatorChallengesPath = "app/creator/challenges/page.tsx";
const creatorPrivatePath = "app/creator/private-challenges/page.tsx";

assert(existsSync(creatorChallengesPath), "Creator challenges route is missing.");
assert(existsSync(creatorPrivatePath), "Creator private challenges route is missing.");
assert(!dashboard.includes("TrendingStories"), "Dashboard must not render TrendingStories.");
assert(!dashboard.includes("Top Performers"), "Dashboard must not render global Top Performers.");
assert(dashboard.includes("Creator Studio"), "Creator Studio heading is missing.");
assert(dashboard.includes("No creator activity yet"), "Creator empty activity state is missing.");
assert(dashboard.includes("hostedChallenges"), "Creator dashboard should use hosted challenges for creator activity.");
assert(dashboard.includes("/creator/challenges"), "Creator dashboard should link to creator challenge listing.");
assert(dashboard.includes("/creator/private-challenges"), "Creator dashboard should link to private challenge listing.");
assert(!dashboard.includes("The Ultimate Showdown"), "Dashboard contains known mock challenge title.");
assert(!dashboard.includes("Next Model Spotlight"), "Dashboard contains known mock challenge title.");
assert(!dashboard.includes("`r`n"), "Dashboard contains literal escaped newline tokens.");

const creatorSectionStart = sidebar.indexOf("const creatorSections");
const creatorSectionEnd = sidebar.indexOf("const hostSections");
assert(creatorSectionStart >= 0 && creatorSectionEnd > creatorSectionStart, "Could not locate creator sidebar section.");
const creatorSection = sidebar.slice(creatorSectionStart, creatorSectionEnd);
assert(!creatorSection.includes('label: "Create Challenge"'), "Creator sidebar still has standalone Create Challenge.");
assert(!creatorSection.includes('label: "Create Private Challenge"'), "Creator sidebar still has standalone Create Private Challenge.");
assert(creatorSection.includes('href: "/creator/challenges", label: "Challenges"'), "Creator sidebar Challenges route is missing.");
assert(creatorSection.includes('href: "/creator/private-challenges", label: "Private Challenges"'), "Creator sidebar Private Challenges route is missing.");
assert(sidebar.includes('href: "/creator/private-challenges", label: "Private"'), "Creator mobile nav should include Private route.");

const creatorChallenges = read(creatorChallengesPath);
const creatorPrivate = read(creatorPrivatePath);
assert(creatorChallenges.includes("hostedChallenges"), "Creator Challenges page must use creator-owned hosted challenges.");
assert(creatorChallenges.includes("Create Challenge"), "Creator Challenges page needs top create action.");
assert(creatorChallenges.includes("No public challenges yet"), "Creator Challenges empty state missing.");
assert(creatorPrivate.includes("getUserPlanAccess"), "Private Challenges page must use existing entitlement helper.");
assert(creatorPrivate.includes("canCreatePrivateChallenges"), "Private creation must be plan gated.");
assert(creatorPrivate.includes("Create Private Challenge"), "Private Challenges page needs create action.");
assert(creatorPrivate.includes("No private challenges yet"), "Private Challenges empty state missing.");
assert(creatorPrivate.includes("data.data?.challenges"), "Private Challenges page should use safe personal challenge data.");
assert(explore.includes("TrendingStories"), "Explore should own TrendingStories discovery.");

console.log("Creator dashboard flow checks passed.");