import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
for (const file of ["app/dashboard/page.tsx", "app/dashboard/host/page.tsx"]) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  assert(!text.includes("Current Challenges"), `${file} must not show Current Challenges section`);
  assert(!text.includes('href="/my-challenges"'), `${file} must not link to My Challenges`);
}
console.log("dashboard current challenges removal checks passed");
