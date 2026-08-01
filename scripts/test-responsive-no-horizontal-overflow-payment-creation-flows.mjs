import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const files = ["components/challenge-builder.tsx", "components/payment-status-journey.tsx", "app/earnings/page.tsx", "app/challenges/[id]/prize-funding/page.tsx"].map((file) => readFileSync(file, "utf8"));
assert(files[0].includes("max-w-[1440px]") && files[0].includes("minmax(0,1fr)"), "builder must preserve a fluid main column");
for (const source of files) assert(source.includes("sm:") || source.includes("md:") || source.includes("lg:"), "affected flow must include responsive breakpoints");
assert(files[0].includes("min-w-0") && files[3].includes("break-words"), "long builder and prize content must be allowed to shrink/wrap");
assert(files[2].includes("max-h-[90vh] w-full max-w-xl overflow-y-auto"), "payout dialog must use a bounded, full-width mobile container with vertical scrolling");
console.log("responsive payment and creation flow checks passed");
