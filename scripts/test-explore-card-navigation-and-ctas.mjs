import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(page.includes('role="link"') && page.includes("window.location.href = href"), "Explore card click must route to detail page");
assert(page.includes("event.stopPropagation()") && page.includes("creatorHref") && page.includes("Save challenge"), "nested profile/save controls must not trigger card navigation");
assert(api.includes("Voting Closed") && api.includes("disabled: true"), "voting closed without results must be passive");
assert(api.includes("phase.phase === \"voting_closed\"") && api.includes("Pay & Enter -"), "closed and paid CTA paths must be explicitly separate");
console.log("explore card navigation and CTA checks passed");
