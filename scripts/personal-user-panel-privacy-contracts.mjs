import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const privacy = read("lib/server/profile-privacy.ts");
const messages = read("lib/server/messages.ts");
const sponsorMessages = read("app/api/sponsor/messages/route.ts");
const social = read("lib/server/social-profile.ts");
const profile = read("components/social/public-profile.tsx");
const publicChallenge = read("lib/server/public-challenge.ts");
const status = read("lib/challenge-status.ts");
const explore = read("app/api/explore/challenges/route.ts");
const leaderboard = read("lib/server/leaderboard.ts");

assert(privacy.includes('audience === "general"') && privacy.includes("allowMessages === false"));
assert(privacy.includes('audience === "sponsor"') && privacy.includes("allowSponsorMessages === false"));
assert(messages.includes('{ newConversation: true, audience: "general" }'));
assert(messages.includes("await assertUsersCanMessage(db, input.senderId, recipientId);") && !messages.includes('{ newConversation: true, audience: "general" });\n  const messageId'));
assert(sponsorMessages.includes('newConversationPrivacy(recipient, "sponsor")'));

assert(social.includes("canViewProfileConnections") && social.includes("connectionsVisible ? followersSnap.size : null") && social.includes("connectionsVisible ? followingSnap.size : null"));
assert(profile.includes("profile.showFollowerConnections ? <Stat") && profile.includes("Connections are private."));
assert(social.includes("isPublicChallenge(doc.id, doc.data())") && social.includes("isPublicSubmission(doc.id, doc.data())"));
assert(social.includes("publicRelatedChallenges.has"), "wins and participation must resolve through public challenges");

assert(status.includes("PUBLIC_CHALLENGE_STATUS_VALUES"));
for (const phase of ["approved", "registration_not_open", "registration_closed", "submission_closed", "voting_not_open", "voting_closed", "under_review", "results_review"]) {
  assert(status.includes(`\"${phase}\"`), `${phase} must remain publicly addressable after approval`);
}
const publicStatuses = status.slice(status.indexOf("PUBLIC_CHALLENGE_STATUS_VALUES"), status.indexOf("const publicChallengeStatuses"));
assert(!publicStatuses.includes('"pending_review"') && !publicStatuses.includes('"draft"'));
assert(publicChallenge.includes("isPublicChallengeStatus(status)"));
assert(explore.includes('["completed", "winners_announced"].includes(phase.phase)') && !explore.includes('["voting_closed", "completed", "winners_announced"].includes(phase.phase)'));

assert(publicChallenge.includes("data.hideParticipantList === true") && publicChallenge.includes("delete result.participantCount"));
assert(publicChallenge.includes("data.hideVoteTotals === true") && publicChallenge.includes("delete result.voteCount"));
assert(leaderboard.includes("challenge.hideRankings === true") && leaderboard.includes('return "hidden_until_close"'));
assert(leaderboard.includes("challenge.hideVoteTotals === true") && leaderboard.includes("voteCount: 0"));

console.log("Personal user panel privacy and public lifecycle contracts passed.");
