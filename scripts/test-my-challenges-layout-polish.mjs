import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "app/my-challenges/page.tsx"), "utf8");

assert(page.includes("md:grid-cols-[180px_minmax(0,1fr)]"), "My Challenges row media column must be compact.");
assert(page.includes("min-h-36"), "My Challenges media frame must use a controlled height.");
assert(page.includes("ChallengeMediaFrame"), "My Challenges must use standardized media display.");
assert(page.includes("Confirmed funds appear after webhook verification."), "Sponsor copy must be short and webhook-confirmed.");
assert(page.includes("Propose Winners") && page.includes("View Challenge"), "key challenge actions must remain visible.");
assert(!page.includes("giant") && !page.includes("fake cards"), "My Challenges must not add fake layout/data artifacts.");

console.log("My Challenges layout polish checks passed.");
