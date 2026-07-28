import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const submissions = read("app/api/submissions/route.ts");
const journey = read("lib/server/participant-journey.ts");
assert(submissions.includes("requireRequestUser") && submissions.includes("PAID_ENTRY_PAYMENT_REQUIRED") && submissions.includes("DUPLICATE_SUBMISSION"));
assert(journey.includes("userOwnsChallenge") && journey.includes("isSponsorProfile"));
assert(!submissions.includes("mockSubmission") && !journey.includes("fakeParticipant"));
console.log("Phase 3B no-fake-data and no-bypass checks passed.");
