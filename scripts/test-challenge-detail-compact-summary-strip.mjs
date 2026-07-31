import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("data-challenge-summary-strip"), "challenge detail must use one compact summary strip");
assert(page.includes("<SummaryItem value={challenge.participants.toLocaleString()}"));
assert(!page.includes("<Metric value="), "four separate metric cards must be removed");
console.log("challenge detail compact summary strip checks passed");
