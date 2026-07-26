import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
const targets = ["app/tournaments", "app/api/tournaments", "app/admin/tournaments", "lib/server/tournament-operations.ts", "components/tournament-builder.tsx"];
const files = [];
function walk(path) {
  const full = join(root, path);
  if (statSync(full).isFile()) files.push(full);
  else for (const child of readdirSync(full)) walk(join(path, child));
}
targets.forEach(walk);
const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
assert(!/fake tournament cards|fake participants|fake brackets|fake matches|fake votes|fake judges|fake winners|fake prize pools|fake sponsor funding|fake payout|fake analytics|fake notifications/i.test(source), "Tournament implementation must not add fake tournament data or claims.");
assert(source.includes("No tournaments yet") && source.includes("backend"), "Empty states should be real backend empty states.");
assert(source.includes("payoutProviderCalled: false"), "Payout execution must remain disabled.");
console.log("Tournament no-mock-data checks passed.");
