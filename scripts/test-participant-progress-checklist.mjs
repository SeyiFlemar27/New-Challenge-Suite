import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const helper = readFileSync("lib/server/participant-journey.ts", "utf8");
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
assert(helper.includes("checklist"), "journey helper must return checklist");
for (const key of ["authenticated", "registered", "approvalRequired", "paymentConfirmed", "entered", "submissionOpen", "alreadySubmitted"]) assert(helper.includes(key), `${key} checklist key missing`);
assert(detail.includes("Entry Progress"), "detail page must render progress checklist");
console.log("participant progress checklist checks passed");