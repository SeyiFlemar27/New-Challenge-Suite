import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("components/creator/creator-workspace.tsx", "utf8");
assert(page.includes('queryKey: ["creator-workspace"]') && page.includes('/api/host/operations'), "Sponsor-Ready must use the authenticated creator dataset");
assert(page.includes('new Set(["published", "scheduled"])'), "Sponsor-Ready must show only published or scheduled challenges");
assert(page.includes("item.sponsorReady || item.sponsorEnabled") && page.includes("monetization"), "Sponsor-Ready must require the feature flag");
assert(page.includes("Manage Readiness"), "eligible challenge cards must offer sponsor-readiness management");
assert(page.includes("Create Challenge"), "the creator workspace must retain challenge creation access");
assert(!page.includes("funding and money release remain inactive"), "Sponsor-Ready route must not render the old placeholder");
console.log("Sponsor-Ready owned challenge checks passed");
