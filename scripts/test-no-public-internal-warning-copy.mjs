import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const files = ["app/challenges/[id]/page.tsx", "app/explore/page.tsx", "app/challenges/[id]/participants/page.tsx", "app/challenges/[id]/prediction/page.tsx", "components/challenge-builder.tsx"];
const forbidden = ["ledger finalization foundation", "Platform fee foundation", "internal warning", "mock payment", "fake balance"];
for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const phrase of forbidden) assert.equal(source.toLowerCase().includes(phrase.toLowerCase()), false, `${file} exposes ${phrase}`);
}
console.log("Public internal-warning copy checks passed.");
