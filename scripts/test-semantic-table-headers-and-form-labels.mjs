import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const ui = read("components/ui.tsx");
const earnings = read("app/earnings/page.tsx");
const prediction = read("app/challenges/[id]/prediction/page.tsx");
assert(ui.includes("export function Field") && ui.includes("<label") && ui.includes("{label}"));
assert(earnings.includes("<label>") && prediction.includes("<Field label="));
assert(read("app/admin/rewards/spins/page.tsx").includes("<thead") && read("app/admin/rewards/spins/page.tsx").includes("<th"));
console.log("semantic table and form-label checks passed");
