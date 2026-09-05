import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const walkthrough = read("components/product-walkthrough.tsx");
const creatorOnboarding = read("app/onboarding/creator/page.tsx");
const onboardingApi = read("app/api/onboarding/route.ts");
const dashboard = read("app/dashboard/page.tsx");
const creatorWorkspace = read("components/creator/creator-workspace.tsx");

assert(walkthrough.includes("getPersonalCapabilities") && walkthrough.includes("creatorIntentSteps"));
assert(walkthrough.includes("capabilities.canManageHostOperations") && walkthrough.includes("capabilities.canUseCreatorAnalytics"));
assert(walkthrough.includes("Creator tools unlock only after plan activation."));

assert(!creatorOnboarding.includes("form.challengeType") && !creatorOnboarding.includes("form.audience"));
assert(creatorOnboarding.includes("Normal, Private, and Tournament creation within monthly quotas"));
assert(!creatorOnboarding.includes("Withdrawals and payouts are not active"));
assert(onboardingApi.includes('["public", "credits", "dorocoin", "judge", "hybrid", "manual"]'));
assert(onboardingApi.includes('value === "dorocoin" ? "credits" : value'));

assert(!dashboard.includes('planExperience.planId === "pro"'));
assert.equal((dashboard.match(/title: "Normal Challenges"/g) ?? []).length, 2);
assert(dashboard.includes('href: "/challenges/create", label: "Build a Normal Challenge"'));
assert(dashboard.includes('href: "/my-entries", label: "My Entries"'));
assert(!dashboard.includes("Transfers and withdrawals remain inactive"));
assert(!creatorWorkspace.includes('href="/creator/boosts"'));
assert(creatorWorkspace.includes('href="/creator/challenges"'));

console.log("Personal user panel shell and onboarding contracts passed.");
