import fs from "node:fs";
import assert from "node:assert/strict";
const files = ["components/challenge-builder.tsx", "app/onboarding/host/page.tsx", "components/payment-status-journey.tsx", "app/earnings/page.tsx"];
const emoji = /[\u{1F300}-\u{1FAFF}]/u;
for (const file of files) assert.ok(!emoji.test(fs.readFileSync(file, "utf8")), `${file} contains decorative emoji`);
const builder = fs.readFileSync(files[0], "utf8");
const host = fs.readFileSync(files[1], "utf8");
for (const icon of ["Sparkles", "Trophy", "Gift", "Rocket", "Award"]) { assert.ok(!builder.includes(icon)); assert.ok(!host.includes(icon)); }
console.log("affected non-navigation flows contain no decorative emoji-style icons");