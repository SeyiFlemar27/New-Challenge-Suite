import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const page = readFileSync("app/challenges/page.tsx", "utf8");
const redirect = readFileSync("app/my-challenges/page.tsx", "utf8");
assert(page.includes('PageTitle title="Challenges"'), "/challenges must be titled Challenges");
assert(page.includes('fetchDashboard'), "/challenges must use user dashboard/owned data");
assert(page.includes('hostedChallenges'), "/challenges must render hosted/created challenges");
assert(page.includes('href="/challenges/create"'), "Create Challenge action must be on Challenges page");
assert(page.includes('No active challenges yet.') && page.includes('No draft challenges yet.'), "Owned challenges management empty states must be clean");
assert(page.includes('Pending Review') && page.includes('Requires Changes') && page.includes('Drafts'), "Challenges page must expose management tabs");
assert(!page.includes('fetchChallenges'), "/challenges must not be public discovery listing");
assert(redirect.includes('redirect("/challenges")'), "/my-challenges must redirect to /challenges");
console.log("owned challenges page checks passed");

