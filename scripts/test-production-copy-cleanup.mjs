import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const files = ["app/explore/page.tsx", "app/wallet/page.tsx", "app/wallet/withdraw/page.tsx", "app/challenges/[id]/join/page.tsx", "components/challenge-builder.tsx"];
for (const file of files) {
  const text = readFileSync(file, "utf8").toLowerCase();
  assert(!text.includes("foundation-ready"), `${file} must not use foundation-ready copy`);
  assert(!text.includes("review withdrawal setup"), `${file} must not use Review Withdrawal Setup copy`);
  assert(!text.includes("cash wallet architecture"), `${file} must not use cash wallet architecture copy`);
  assert(!text.includes("paid-entry prize pools are not available yet"), `${file} must not use paid-entry prize pool unavailable copy`);
}
console.log("production copy cleanup checks passed");
