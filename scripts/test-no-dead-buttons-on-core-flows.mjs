import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const explore = read("app/explore/page.tsx");
const detail = read("app/challenges/[id]/page.tsx");
const participants = read("app/challenges/[id]/participants/page.tsx");
const participantCard = read("components/challenge-participant-card.tsx");
const bonus = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(explore.includes("detailHref") && explore.includes("cta.href"));
assert(detail.includes("/join") && detail.includes("/votes") && detail.includes("/participants"));
assert(participants.includes("ChallengeParticipantCard"));
assert(participantCard.includes("submissionPath") && participantCard.includes("profilePath"));
assert(bonus.includes("disabled title="));
console.log("Core action destination checks passed.");
