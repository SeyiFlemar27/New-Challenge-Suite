import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs.readFileSync("components/challenge-builder.tsx", "utf8");
assert.match(source, /step === steps\.length - 1 \? <Checklist/);
assert.match(source, /Step \{step \+ 1\} of \{steps\.length\}/);
assert.match(source, /requirement\{validation\.missingCount === 1/);
console.log("publish checklist is reserved for review step");