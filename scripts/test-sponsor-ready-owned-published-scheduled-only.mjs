import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/creator/[tool]/page.tsx", "utf8");
assert(page.includes('queryKey: ["dashboard", "sponsor-ready"]'), "Sponsor-Ready must use the authenticated dashboard dataset");
assert(page.includes('new Set(["published", "scheduled"])'), "Sponsor-Ready must show only published or scheduled challenges");
assert(page.includes("challenge.sponsorReady || challenge.sponsorEnabled || monetization.sponsorReady"), "Sponsor-Ready must require the feature flag");
assert(page.includes("Enable on Existing Challenge"), "empty state must offer existing challenge setup");
assert(page.includes("Create New Challenge"), "empty state must offer new challenge creation");
assert(!page.includes("funding and money release remain inactive") || page.indexOf("if (tool === \"sponsor-ready\")") < page.indexOf("funding and money release remain inactive"), "Sponsor-Ready route must not render the old placeholder");
console.log("Sponsor-Ready owned challenge checks passed");
