import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const builder = read("components/normal-challenge-builder.tsx");
const privateBuilder = read("components/challenge-builder.tsx");
const publicRoute = read("app/challenges/create/page.tsx");
const publicDraftRoute = read("app/challenges/create/[draftId]/page.tsx");
const privateRoutePath = "app/creator/private-challenges/create/page.tsx";
const privateRoute = read(privateRoutePath);
const privateList = read("app/creator/private-challenges/page.tsx");
const sidebar = read("components/sidebar.tsx");

assert(existsSync(join(root, privateRoutePath)), "Private challenge builder route must exist.");
assert(!publicRoute.includes("createChallengeDraft"), "Opening challenge creation must not create a draft.");
assert(publicRoute.includes("NormalChallengeBuilder"), "Public create route must use the Normal Challenge foundation.");
assert(publicDraftRoute.includes("<NormalChallengeBuilder draftId={draftId}"), "Public draft route must use the Normal Challenge editor with draft id.");
assert(privateRoute.includes('<ChallengeBuilder mode="private" />'), "Private builder route must use private challenge builder mode.");

for (const step of ["Basics", "Participation", "Entry & Submission", "Competition", "Rewards", "Schedule", "Review"]) {
  assert(builder.includes(step), `Public builder step missing: ${step}`);
}
for (const step of ["Basics", "Access Code", "Entry & Eligibility", "Submissions", "Timeline", "Voting / Judging", "Prize & Monetization", "Media & Branding", "Review & Submit"]) {
  assert(privateBuilder.includes(step), `Private builder step missing: ${step}`);
}

assert(privateBuilder.includes("canCreatePrivateChallenges"), "Private builder must use existing private challenge entitlement gate.");
assert(privateBuilder.includes("Private challenges are available on Creator Plan"), "Private builder locked state copy is missing.");
assert(privateList.includes('href="/creator/private-challenges/create"'), "Private Challenges create action must route to creator private builder.");
assert(sidebar.includes('href: "/challenges", label: "Challenges"'), "Creator sidebar Challenges item missing.");
assert(sidebar.includes('href: "/creator/private-challenges", label: "Private Challenges"'), "Creator sidebar Private Challenges item missing.");

const creatorSection = sidebar.slice(sidebar.indexOf("const creatorSections"), sidebar.indexOf("const starterSections"));
assert(!creatorSection.includes('label: "Create Challenge"'), "Standalone Create Challenge sidebar item was restored.");
assert(!creatorSection.includes('label: "Create Private Challenge"'), "Standalone Create Private Challenge sidebar item was restored.");

assert(!builder.includes(">Preview<") && !builder.includes("Publish Challenge"), "Normal creation must not restore Preview or Publish actions.");
assert(!builder.includes("Fiverr") && !builder.includes("gig") && !builder.includes("buyer") && !builder.includes("seller"), "Builder copy must not use marketplace wording.");
assert(builder.includes("updateChallengeDraft"), "Invisible autosave must update a persisted draft.");
assert(builder.includes("publishChallengeDraft"), "Submit for Review must use the persisted draft endpoint.");

console.log("Challenge builder flow checks passed.");


