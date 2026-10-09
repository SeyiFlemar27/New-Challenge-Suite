import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const invites = read("lib/server/private-invites.ts");
const accessRoute = read("app/api/private-exclusive/route.ts");
const joinRoute = read("app/api/challenges/[id]/join/route.ts");
const createRoute = read("app/api/challenges/route.ts");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");
const admissionUi = read("components/private-admission.tsx");
const builder = read("components/challenge-builder.tsx");

assert.match(invites, /randomBytes\(32\)\.toString\("base64url"\)/, "invite links and direct invites use unguessable tokens");
assert.match(invites, /tokenHash: hashPrivateInviteToken\(token\)/, "stored invitation records contain token hashes");
assert.match(invites, /codeHash: hashPrivateInviteCode\(code\)/, "stored access codes are hashed");
assert.match(invites, /recipientEmail: email/, "direct invitations bind a verified recipient email");
assert.match(invites, /input\.challengeId !== challengeId/, "credentials cannot be replayed against another challenge");
assert.match(invites, /inviteExpired\(invite\)/, "invitation expiry is enforced during claim");
assert.match(invites, /input\.verifiedEmail\.trim\(\)\.toLowerCase\(\)/, "direct acceptance is bound to the verified identity email");
assert.match(invites, /transaction\.create\(accessRef, \{ \.\.\.receipt/, "admission and requirement evidence persist atomically");
assert.match(invites, /transaction\.create\(db\.collection\("privateInviteAuditEvents"\)/, "admission is auditable");
assert.match(invites, /validatePrivateParticipantEligibility/, "eligibility is validated in the admission service");
assert.match(invites, /transaction\.create\(participantRef/, "admission creates the participant membership record");
assert.match(invites, /validatePrivateRequirementEvidence/, "configured participant requirements are enforced");
assert.match(accessRoute, /consumePrivateAdmissionAttempt/, "admission attempts have a durable Firestore rate limit");
assert.match(accessRoute, /String\(challenge\.privateAccessMethod \?\? ""\) !== String\(invite\.accessMethod \?\? ""\)/, "credential mode must match the challenge's selected mode");
assert.match(accessRoute, /action === "rotate_invites"/, "owners can rotate invitation credentials");
assert.match(accessRoute, /action === "revoke_invite"/, "owners can revoke invitation credentials");
assert.match(joinRoute, /grant\.source \?\? ""\) !== String\(challenge\.privateAccessMethod/, "join cannot bypass the selected admission mechanism");
assert.match(joinRoute, /validatePrivateRequirementEvidence/, "join rechecks admission requirement evidence");
assert.match(createRoute, /privateDirectInvitees: \[\]/, "recipient emails are not stored on the challenge document");
assert.match(publishRoute, /privateAccessCode: ""/, "plaintext access codes are not stored on published challenges");
assert.match(admissionUi, /Accept Requirements and Join/, "participants explicitly accept requirements before admission");
assert.match(builder, /Invite Link/);
assert.match(builder, /Invitation Code/);
assert.match(builder, /Direct Invitations/);
assert.doesNotMatch(builder, /Link \+ Code configured|Access: `Link \+ Code/, "builder does not describe a combined access mode");

console.log("Private access method enforcement contract passed.");
