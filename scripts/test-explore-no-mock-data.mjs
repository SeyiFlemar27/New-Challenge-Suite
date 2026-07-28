import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const file of ["app/explore/page.tsx", "app/api/explore/challenges/route.ts"]) {
  const text = readFileSync(file, "utf8");
  assert(!/mockChallenges|sampleChallenges|demoChallenges|fakeChallenges/i.test(text), `${file} must not use mock explore data`);
}
console.log("explore no mock data checks passed");