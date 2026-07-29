import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");

assert(builder.includes('Field label="Challenge/Submissions start"'));
const retiredLabel = ['Field label="Challenge', 'starts"'].join(" ");
assert(!builder.includes(retiredLabel));
assert(builder.indexOf('Field label="Registration or invite close"') < builder.indexOf('Field label="Challenge/Submissions start"'));
assert(builder.indexOf('Field label="Challenge/Submissions start"') < builder.indexOf('Field label="Submission deadline"'));

console.log("Create challenge timeline label checks passed.");
