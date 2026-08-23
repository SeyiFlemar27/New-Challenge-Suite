import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/dashboard/page.tsx", "utf8");
const studio = readFileSync("components/creator/creator-studio.tsx", "utf8");
assert(page.includes("<CreatorStudio"), "Creator and Pro dashboards must render the shared Creator Studio");
assert(!studio.includes("creatorTools.map"), "Creator Studio must not repeat the full sidebar tool catalog");
assert(studio.includes("Today") && studio.includes("Your Challenges"), "Creator Studio must prioritize real creator work");
assert(studio.includes("slice(0, 3)"), "Creator Studio must keep attention and challenge previews concise");
console.log("simplified Creator Studio checks passed");
