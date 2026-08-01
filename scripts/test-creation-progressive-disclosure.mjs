import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs.readFileSync("components/challenge-builder.tsx", "utf8");
assert.match(source, /children && enabled && !disabled/);
for (const label of ["Enable Paid Entry", "Make this challenge Sponsor Ready", "Enable Prize Pool", "Enable Paid Votes"]) assert.ok(source.includes(label));
assert.ok(source.includes("65% to winners, 20% to the creator, and 15% to Challenge Suite"));
assert.ok(source.includes("Viewer contributions are not accepted"));
console.log("creation monetization uses progressive disclosure");