import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");

assert(builder.includes('StepTitle title="Media & Branding"'));
assert(builder.includes("space-y-12"));
assert(builder.includes("md:grid-cols-3"), "image gallery must use three equal desktop columns.");
assert(builder.includes("grid gap-6 md:grid-cols-3"), "image cards must stack by default and align on desktop.");
assert(builder.includes('className="border-t border-white/10 pt-10"'), "video and document sections need clear separation.");
assert(builder.includes('className="mt-6 max-w-2xl"'), "video upload must have a stable readable width.");
assert(!builder.includes('min-h-[320px]'), "the removed overpacked upload panel must not return.");
assert(!builder.includes("purpose="), "upload slots should not carry long nested purpose copy.");

console.log("Create challenge media spacing checks passed.");
