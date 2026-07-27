import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const redirectPage = readFileSync(join(process.cwd(), "app/my-challenges/page.tsx"), "utf8");
const challengesPage = readFileSync(join(process.cwd(), "app/challenges/page.tsx"), "utf8");

assert(redirectPage.includes('redirect("/challenges")'), "My Challenges route must redirect to Challenges.");
assert(challengesPage.includes("ChallengeMediaFrame"), "Challenges must use standardized media display.");
assert(challengesPage.includes("Propose Winners") && challengesPage.includes("View Challenge"), "key challenge actions must remain visible.");
assert(challengesPage.includes("grid gap-5 md:grid-cols-2 xl:grid-cols-3"), "Challenges page must use compact responsive card layout.");
assert(!challengesPage.includes("fake cards"), "Challenges page must not add fake layout/data artifacts.");

console.log("My Challenges redirect and Challenges layout checks passed.");
