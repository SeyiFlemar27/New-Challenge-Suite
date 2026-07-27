import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const builder = read("components/challenge-builder.tsx");
const publicRoute = read("app/challenges/create/page.tsx");
const privateRoutePath = "app/creator/private-challenges/create/page.tsx";
const privateRoute = read(privateRoutePath);
const privateList = read("app/creator/private-challenges/page.tsx");
const sidebar = read("components/sidebar.tsx");

assert(existsSync(join(root, privateRoutePath)), "Private challenge builder route must exist.");
assert(publicRoute.includes('<ChallengeBuilder mode="public" />'), "Public builder route must use public challenge builder mode.");
assert(privateRoute.includes('<ChallengeBuilder mode="private" />'), "Private builder route must use private challenge builder mode.");

for (const step of ["Overview", "Rules & Eligibility", "Entry & Submission", "Voting & Timeline", "Media & Branding", "Review & Publish"]) {
  assert(builder.includes(step), `Public builder step missing: ${step}`);
}
for (const step of ["Overview", "Access & Invites", "Rules & Eligibility", "Entry & Submission", "Timeline", "Review & Publish"]) {
  assert(builder.includes(step), `Private builder step missing: ${step}`);
}

assert(builder.includes("canCreatePrivateChallenges"), "Private builder must use existing private challenge entitlement gate.");
assert(builder.includes("Private challenges are available on Creator Plan"), "Private builder locked state copy is missing.");
assert(privateList.includes('href="/creator/private-challenges/create"'), "Private Challenges create action must route to creator private builder.");
assert(sidebar.includes('href: "/challenges", label: "Challenges"'), "Creator sidebar Challenges item missing.");
assert(sidebar.includes('href: "/creator/private-challenges", label: "Private Challenges"'), "Creator sidebar Private Challenges item missing.");

const creatorSection = sidebar.slice(sidebar.indexOf("const creatorSections"), sidebar.indexOf("const starterSections"));
assert(!creatorSection.includes('label: "Create Challenge"'), "Standalone Create Challenge sidebar item was restored.");
assert(!creatorSection.includes('label: "Create Private Challenge"'), "Standalone Create Private Challenge sidebar item was restored.");

assert(builder.includes("setPreview(true)") && builder.includes("Preview"), "Preview behavior must be present.");
assert(!builder.includes("Fiverr") && !builder.includes("gig") && !builder.includes("buyer") && !builder.includes("seller"), "Builder copy must not use marketplace wording.");
assert(builder.includes("createChallenge(payload(false))"), "Save Draft must use existing challenge creation service.");
assert(builder.includes("createChallenge(payload(true))"), "Publish must use existing challenge creation service.");

console.log("Challenge builder flow checks passed.");

