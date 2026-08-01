import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync("components/ui.tsx", "utf8");
const files = ["app/host/[tool]/page.tsx", "app/earnings/page.tsx", "app/onboarding/premium/page.tsx", "app/dashboard/host/[tool]/page.tsx"].map((path) => readFileSync(path, "utf8")).join("\n");
assert.doesNotMatch(ui, /\{icon\}/);
assert.doesNotMatch(files, /Coming Soon|Export Coming Soon|Operational changes are disabled|production-safe workspace foundation/i);
assert.doesNotMatch(files, /[🎉🚀🏆✨🎁💰🔥⭐🏅🎯]/u);
assert.match(ui, /focus-visible:ring/);
console.log("presentation cleanup contract passed");