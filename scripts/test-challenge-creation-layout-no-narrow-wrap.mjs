import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs.readFileSync("components/challenge-builder.tsx", "utf8");
assert.match(source, /max-w-\[1440px\]/);
assert.match(source, /lg:grid-cols-\[220px_minmax\(0,1fr\)\]/);
assert.match(source, /2xl:grid-cols-\[minmax\(0,1fr\)_280px\]/);
assert.match(source, /p-4 sm:p-6 lg:p-8/);
console.log("challenge creation layout avoids narrow wrapping");