import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const touched = [
  "app/challenges/[id]/page.tsx",
  "app/challenges/[id]/join/page.tsx",
  "app/api/challenges/[id]/route.ts",
  "app/api/submissions/route.ts",
  "app/admin/finance/page.tsx",
  "app/sponsor/dashboard/page.tsx"
];
const banned = [/foundation-only/i, /demo mode/i, /mock/i, /fake/i, /preview-only/i, /storage-disabled/i];
for (const file of touched) {
  const text = readFileSync(file, "utf8");
  for (const pattern of banned) assert(!pattern.test(text), `${file} contains user-facing ${pattern}`);
}
console.log("no foundation copy user-facing checks passed");
