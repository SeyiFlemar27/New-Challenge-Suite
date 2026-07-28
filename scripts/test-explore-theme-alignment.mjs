import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync("app/explore/page.tsx", "utf8");
assert(page.includes("bg-[#080808]") && page.includes("bg-[#111111]") && page.includes("text-white"), "Explore must use dark Challenge Suite surfaces");
assert(page.includes("var(--gold)"), "Explore must use Challenge Suite yellow accent");
assert(!page.includes("bg-[#f5f1e8]") && !page.includes("Challenge Suite Marketplace"), "Explore must not retain disconnected light marketplace canvas");
assert(!/Fiverr|green-500|emerald|seller|gig/i.test(page), "Explore must avoid Fiverr/generic marketplace styling");
console.log("explore theme alignment checks passed");
