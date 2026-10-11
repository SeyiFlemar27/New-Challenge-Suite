import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../storage.rules", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Storage Rules function ${name} exists`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Unclosed Storage Rules function ${name}`);
}

const checks = [
  ["isActiveAdminUserProfile", ["users/$(userId)"], 2],
  ["isChallengeManager", ["challenges/$(challengeId)", "isEnterpriseChallengeManager"], 2],
  ["hasPrivateChallengeMediaAccess", ["challengeMediaAccess/$(challengeId + '_' + request.auth.uid)"], 2],
  ["isEnterpriseChallengeManager", ["users/$(request.auth.uid)"], 2],
  ["isPublicChallengeBanner", ["challenges/$(challengeId)"], 1],
  ["isPublicPrivatePreviewBanner", ["challenges/$(challengeId)"], 1],
  ["canReadVerifiedChallengeMedia", ["challenges/$(challengeId)", "canReadChallengeMedia"], 2],
  ["canReadSponsorConversation", ["sponsorConversations/$(conversationId)", "isActiveAdminUser"], 2],
  ["isTournamentSubmissionOwner", ["tournamentParticipants/$(tournamentId + '_' + request.auth.uid)", "tournamentTeamMemberships/$(tournamentId + '_' + request.auth.uid)"], 2]
];

for (const [name, expectedFragments, maxDocumentReads] of checks) {
  const body = functionBody(name);
  for (const fragment of expectedFragments) assert.ok(body.includes(fragment), `${name} retains expected bounded authorization inputs: ${fragment}`);
  const distinctDocumentPaths = new Set([...body.matchAll(/let\s+\w+Path\s*=\s*\/databases\/\(default\)\/documents\/[^;]+/g)].map((match) => match[0]));
  assert.ok(distinctDocumentPaths.size <= maxDocumentReads, `${name} declares no more than ${maxDocumentReads} Firestore document paths directly; repeated get/exists on a cached path count once`);
}

assert.ok(!functionBody("isEnterpriseChallengeManager").includes("enterpriseOrganizations/"), "Storage authorization does not fetch a third Enterprise organization document");
assert.ok(functionBody("canReadChallengeMedia").includes("hasPrivateChallengeMediaAccess"), "private Storage authorization uses the single bounded media-access projection");
assert.ok(!functionBody("canReadChallengeMedia").includes("isPublicPrivatePreview"), "Private preview is not used as a blanket authorization for challenge media");
assert.ok(functionBody("isPublicPrivatePreviewBanner").includes("coverImagePath"), "Discoverable private media is restricted to the exact configured cover path");
assert.ok(source.includes("match /challengeMediaAccess/{" ) === false, "Storage Rules do not grant clients direct access to the Firestore authorization projection");
console.log(`PASS Storage Rules document-access contract: ${checks.length} authorization branches remain within the two-document cross-service limit.`);
