import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const detail = read("app/challenges/[id]/page.tsx");
const myChallenges = read("app/my-challenges/page.tsx");
const builder = read("components/challenge-builder.tsx");
const api = read("app/api/challenges/route.ts");
const prediction = read("app/prediction-arena/page.tsx");

assert(!detail.includes("Following updates") && !detail.includes("Follow updates"), "Challenge detail should remove Following updates button.");
assert(detail.includes("Save Challenge") && detail.includes("ChallengeShare"), "Challenge detail should keep save/share actions.");
assert(detail.includes("Upgrade to Creator Plan to participate in this premium challenge."), "Free users should get premium upgrade prompt.");
assert(detail.includes("freePremiumBlocked"), "Premium challenge join/submit should be blocked for free users without hiding challenge.");
assert(detail.includes("grid gap-4 sm:grid-cols-2 lg:grid-cols-4"), "Challenge stat cards should stay aligned in a consistent grid.");
assert(myChallenges.includes("md:grid-cols-[220px_minmax(0,1fr)]") && myChallenges.includes("Propose Winners"), "My Challenges should keep clean horizontal cards with winner proposal action.");
assert(builder.includes("Paid votes unlock for Creator premium, Host premium, and approved Enterprise accounts"), "Paid Votes copy should be setup-safe and premium-unlocked.");
assert(api.includes("PAID_VOTES_LOCKED") && api.includes("paidVotesCheckoutStatus"), "Paid Votes server logic should distinguish plan lock from setup-required state.");
assert(prediction.includes("Prediction Arena is coming soon") && prediction.includes("compliance-gated"), "Prediction Arena should stay coming soon and compliance-gated.");
assert(!/casino|gambling|winnings|Prize released|Payout sent/i.test(detail + prediction), "Touched challenge surfaces must avoid gambling and payout activation copy.");

console.log("Challenge layout polish checks passed.");
