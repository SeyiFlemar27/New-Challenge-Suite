import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(api.includes("isDefaultDiscoverable"), "default discoverable filter required");
for (const marker of ["voting_closed", "completed", "cancelled", "deleted", "draft", "pending_review"]) assert(api.includes(marker), `default exclusions must cover ${marker}`);
assert(api.includes("if (!phaseFilter && !isDefaultDiscoverable"), "default Browse must exclude closed/inactive records");
assert(api.includes("if (phaseFilter && phase.phase !== phaseFilter)"), "explicit phase filter must allow intentional closed/completed filtering");
console.log("explore default active filtering checks passed");
