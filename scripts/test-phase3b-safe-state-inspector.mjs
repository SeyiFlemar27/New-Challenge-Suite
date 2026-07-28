import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const inspector = read("scripts/inspect-challenge-participant-journey.mjs");
for (const token of ["--challengeId", "--userId", "normalizedTimeline", "viewerRelationship", "participantState", "paymentState", "submissionState", "blockers", "nextAction"]) assert(inspector.includes(token));
for (const forbidden of ["providerPaymentIntentId", "idToken", "kycData", "serviceAccount"]) assert(!inspector.includes(forbidden));
console.log("Phase 3B safe state inspector checks passed.");
