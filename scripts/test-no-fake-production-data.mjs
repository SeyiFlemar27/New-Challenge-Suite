import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const files = ["app/challenges/[id]/page.tsx", "app/challenges/[id]/join/page.tsx", "lib/server/leaderboard.ts", "app/api/challenges/[id]/route.ts"];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  assert(!/fake|sample|simulated|hardcoded/i.test(text), `${file} should not add fake production data`);
}
console.log("no fake production data checks passed");
