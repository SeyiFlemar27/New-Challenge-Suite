import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const builder = readFileSync(join(process.cwd(), "components/challenge-builder.tsx"), "utf8");

assert(builder.includes("publicSteps") && builder.includes("privateSteps"), "challenge builder must use shared step arrays.");
assert(builder.includes("Stepper") && builder.includes("StepContent") && builder.includes("Helper"), "challenge builder must use consistent step-builder composition.");
assert(builder.includes("Overview") && builder.includes("Rules & Eligibility") && builder.includes("Entry & Submission") && builder.includes("Review & Publish"), "core create flows must use the same logical builder stages.");
assert(builder.includes("Monetization & Prize Pool") && builder.includes("Media & Branding"), "public challenge builder must preserve monetization and media steps.");
assert(builder.includes("rounded-[8px]") && builder.includes("lg:grid-cols-[minmax(0,1fr)_320px]"), "builder layout must use stable, compact app card standards.");
assert(!builder.includes("landing page") && !builder.includes("hero section"), "builder must remain an app workflow, not marketing layout.");

console.log("Create challenge builder layout checks passed.");
