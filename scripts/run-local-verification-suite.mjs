import { fileURLToPath } from "node:url";
const selected = process.argv[2];
const allowed = ["scripts/run-p0-emulator-regressions.mjs", "scripts/test-tournament-team-entitlements-emulator.mjs", "scripts/test-tournament-notifications-emulator.mjs", "scripts/test-tournament-complete-lifecycles-emulator.mjs", "scripts/qa/run-p1-browser-e2e.mjs"];
if (!allowed.includes(selected)) throw new Error("Unsupported local verification suite");
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
await import(new URL(`../${selected}`, import.meta.url));
