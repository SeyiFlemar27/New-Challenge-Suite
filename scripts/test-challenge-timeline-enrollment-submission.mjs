import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const lifecycle = read("lib/challenge-status.ts");
const detailsApi = read("app/api/challenges/[id]/route.ts");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const submissionRoute = read("app/api/submissions/route.ts");
const viewerState = read("lib/server/challenge-viewer-state.ts");
const journey = read("lib/server/participant-journey.ts");

assert(lifecycle.includes('persisted === "registration_open"') && lifecycle.includes('"submissions_not_open"'), "registration_open must not automatically mean submissions_open.");
assert(lifecycle.includes("submissionOpensAt ?? timeline.challengeStartsAt"), "submission opening must be tied to submission/challenge start, not registration open.");
assert(!lifecycle.includes("timeline.submissionClosesAt ?? timeline.registrationClosesAt"), "submission close fallback must not use registration close as submission window.");
assert(detailsApi.includes("participationState") && detailsApi.includes("submissionStatus") && detailsApi.includes("canSubmit") && detailsApi.includes("participantJourney"), "challenge detail API must expose normalized participation/submission/journey state.");
assert(joinPage.includes("submissionAccess") && joinPage.includes("canSubmitNow"), "join page must consume backend submission access instead of local submit availability only.");
assert(viewerState.includes("Registration still open") && viewerState.includes("Waiting for submissions"), "submission access must show enrollment and non-open submission states.");
assert(journey.includes("Registration complete") && journey.includes("Waiting for submissions to open") && joinPage.includes("Register for Challenge") && joinPage.includes("Enter Challenge"), "participant journey must separate registration from entering/submission.");
assert(submissionRoute.includes("NOT_ENROLLED_FOR_SUBMISSION"), "submission API must require existing enrollment before accepting submissions.");
assert(!submissionRoute.includes("registeredAt: now") || submissionRoute.includes("NOT_ENROLLED_FOR_SUBMISSION"), "submission API must not create participants as the normal submit path.");

console.log("Challenge timeline enrollment/submission checks passed.");
