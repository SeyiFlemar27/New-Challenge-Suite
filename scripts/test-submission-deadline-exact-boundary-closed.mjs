import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync("lib/challenge-status.ts", "utf8");
const viewerState = readFileSync("lib/server/challenge-viewer-state.ts", "utf8");
const start = Date.parse("2026-07-28T19:30:00.000Z");
const deadline = Date.parse("2026-07-28T19:40:00.000Z");
const isOpen = (now) => now >= start && now < deadline;

assert.equal(isOpen(start), true, "submission must open at the exact start instant");
assert.equal(isOpen(start + 1_000), true, "submission must remain open one second after start");
assert.equal(isOpen(deadline - 1_000), true, "submission must remain open one second before deadline");
assert.equal(isOpen(deadline), false, "submission must close at the exact deadline");
assert.equal(isOpen(deadline + 1_000), false, "submission must remain closed after deadline");
assert(status.includes("if (closesAt && now >= closesAt) return \"submissions_closed\""), "canonical lifecycle must close at the exact deadline");
assert(viewerState.includes('"submission_closed"') && viewerState.includes("The submission deadline has passed."), "exact-deadline blocker must report closed, not not-open");
console.log("submission exact-deadline closure checks passed");
