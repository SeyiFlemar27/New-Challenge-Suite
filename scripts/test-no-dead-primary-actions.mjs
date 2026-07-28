import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");
assert(detail.includes('href={`/challenges/${challenge.id}/join`}'), "Submit action must route to real join page");
assert(detail.includes('href={`/challenges/${challenge.id}/votes`}'), "Voting action must route to real votes page");
assert(join.includes('onSubmit={submit}') && join.includes("canSubmitNow"), "submission form must be gated by a real submit action and access state");
assert(!/coming soon primary|coming soon/i.test(detail), "detail page must not expose coming-soon primary actions");
console.log("no dead primary action checks passed");
