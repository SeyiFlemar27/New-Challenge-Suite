import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const root = process.cwd();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = pathToFileURL(`${root}/${specifier.slice(2)}.ts`).href;
      return { url: target, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const target = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(target)) return { url: target.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      const source = readFileSync(new URL(url), "utf8");
      return { format: "module", source: stripTypeScriptTypes(source, { mode: "transform" }), shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

const { buildStoredVotingSettings } = await import(pathToFileURL(`${root}/lib/server/challenge-publish-payload.ts`).href);
const { assertNoUndefinedFirestoreValues, InvalidFirestorePayloadError, sanitizeFirestorePayload } = await import(pathToFileURL(`${root}/lib/server/firestore-payload.ts`).href);
const { createAuditLogRecord } = await import(pathToFileURL(`${root}/lib/server/audit.ts`).href);
const { commitChallengeReviewSubmission } = await import(pathToFileURL(`${root}/lib/server/challenge-review-submission.ts`).href);
const { getNormalChallengeReadiness } = await import(pathToFileURL(`${root}/lib/normal-challenge-readiness.ts`).href);

const paid = buildStoredVotingSettings({ allowFreeVotes: true, allowPaidVotes: false, allowDoroCoinVotes: true, weightedVotes: false });
assert.equal(paid.allowPaidVotes, false);
assert.equal("allowDoroCoinVotes" in paid, false);
assert.doesNotThrow(() => assertNoUndefinedFirestoreValues(paid));

const legacy = buildStoredVotingSettings({ allowFreeVotes: true, allowDoroCoinVotes: true });
assert.equal(legacy.allowPaidVotes, true);
assert.equal("allowDoroCoinVotes" in legacy, false);

assert.throws(
  () => assertNoUndefinedFirestoreValues({ votingSettings: { allowDoroCoinVotes: undefined } }),
  (error) => error instanceof InvalidFirestorePayloadError && error.fieldPath === "payload.votingSettings.allowDoroCoinVotes"
);
assert.throws(() => assertNoUndefinedFirestoreValues({ values: [true, undefined] }), InvalidFirestorePayloadError);
const date = new Date();
class Sentinel { constructor() { this.hidden = undefined; } }
const sentinel = new Sentinel();
assert.doesNotThrow(() => assertNoUndefinedFirestoreValues({ date, sentinel, nullable: null, values: [1, "two"] }));
assert.deepEqual(sanitizeFirestorePayload({ canonical: true, legacy: undefined, nested: { keep: "yes", omit: undefined } }), { canonical: true, nested: { keep: "yes" } });
assert.throws(() => sanitizeFirestorePayload({ values: [true, undefined] }), InvalidFirestorePayloadError);
assert.equal(sanitizeFirestorePayload(date), date);
assert.equal(sanitizeFirestorePayload(sentinel), sentinel);

const screenshotState = {
  title: "Screenshot equivalent challenge",
  description: "A complete Normal Challenge description with enough detail for review.",
  category: "Creative",
  standardRules: "Submit original work and follow every challenge requirement.",
  coverMediaType: "image",
  coverImageUrl: "https://storage.googleapis.com/example/cover.jpg",
  coverImagePath: "challenges/drafts/user/banner/cover.jpg",
  participationMode: "open",
  maxParticipants: 0,
  hideParticipantList: true,
  eligibleCountry: "",
  minimumAge: 18,
  maximumAge: 24,
  acceptedSubmissionTypes: ["image"],
  challengeGuidelines: "Upload one original image and include a short explanation.",
  competitionFormat: "Public Voting",
  votingSettings: legacy,
  hideVoteTotals: false,
  hideRankings: false,
  numberOfWinners: 3,
  winnerSplits: [50, 30, 20],
  prizeType: "money",
  prizeValue: 1000,
  prizeCurrency: "USD",
  registrationOpensAt: "2026-08-14T16:14:00.000Z",
  registrationDeadline: "2026-08-17T16:14:00.000Z",
  submissionStartAt: "2026-08-17T16:14:00.000Z",
  submissionDeadline: "2026-08-20T16:14:00.000Z",
  votingStartsAt: "2026-08-20T16:14:00.000Z",
  votingDeadline: "2026-08-23T16:14:00.000Z",
  winnerAnnouncementAt: "2026-08-24T16:14:00.000Z",
  timeZone: "America/New_York",
  monetization: { paidEntryRequested: false, currency: "USD" }
};
const readiness = getNormalChallengeReadiness(screenshotState);
assert.equal(readiness.ready, true);
assert.deepEqual(readiness.issues, []);

const key = (ref) => `${ref.collection}/${ref.id}`;
function fakeDb(initial, failCommit = false) {
  const state = new Map(Object.entries(initial));
  const db = {
    collection(collection) {
      return { doc(id) { return { collection, id }; } };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          const value = state.get(key(ref));
          return { id: ref.id, exists: value !== undefined, data: () => value };
        },
        set(ref, value, options) { writes.push({ ref, value, options }); }
      };
      const result = await callback(transaction);
      if (failCommit) throw new Error("simulated atomic commit failure");
      for (const write of writes) {
        const current = state.get(key(write.ref)) ?? {};
        state.set(key(write.ref), write.options?.merge ? { ...current, ...write.value } : write.value);
      }
      return result;
    }
  };
  return { db, state };
}

const challengeId = "screenshot-state";
const now = "2026-08-13T12:00:00.000Z";
const update = { ...screenshotState, id: challengeId, creatorId: "creator-1", ownerId: "creator-1", status: "pending_review", lifecycleStatus: "pending_review", votingSettings: legacy, reviewRevisionId: `challenge_review_${challengeId}_initial`, updatedAt: now };
const revision = { id: `challenge_review_${challengeId}_initial`, challengeId, creatorId: "creator-1", status: "pending_review", revision: 1, submittedAt: now, createdAt: now, updatedAt: now };
const revenue = { id: `revenue_share_${challengeId}`, challengeId, creatorId: "creator-1", status: "foundation", createdAt: now, updatedAt: now };
const submitAudit = createAuditLogRecord({ actorId: "creator-1", actorType: "user", action: "challenge_submitted_for_review", targetType: "challenge", targetId: challengeId, before: { status: "draft" }, after: { status: "pending_review" }, createdAt: now }, `challenge_submit_${challengeId}_initial`, now);
const revisionAudit = createAuditLogRecord({ actorId: "creator-1", actorType: "user", action: "challenge_review_revision_created", targetType: "challenge", targetId: challengeId, after: { revisionId: revision.id, revision: 1 }, createdAt: now }, `challenge_revision_${challengeId}_initial`, now);
assert.equal(Object.hasOwn(revisionAudit, "before"), false, "an absent audit before-state must be omitted, not stored as undefined");
assert.doesNotThrow(() => assertNoUndefinedFirestoreValues(revisionAudit, "revisionAudit"));
const transitionInput = { challengeId, userId: "creator-1", expectedStatus: "draft", update, revision, revenue, submitAudit, revisionAudit, prizePool: { prizeType: "money", prizeValueCents: 100000, sponsorEnabled: false, paidEntryEnabled: false, now } };

const successful = fakeDb({ [`challenges/${challengeId}`]: { id: challengeId, creatorId: "creator-1", status: "draft" } });
const first = await commitChallengeReviewSubmission(successful.db, transitionInput);
assert.equal(first.idempotent, false);
assert.equal(successful.state.get(`challenges/${challengeId}`).status, "pending_review");
assert.equal(successful.state.get(`challengeReviewRevisions/${revision.id}`).status, "pending_review");
assert.equal(successful.state.get(`auditLogs/${submitAudit.id}`).action, "challenge_submitted_for_review");
assert.equal(successful.state.get(`auditLogs/${revisionAudit.id}`).action, "challenge_review_revision_created");
assert.doesNotThrow(() => assertNoUndefinedFirestoreValues(successful.state.get(`challenges/${challengeId}`)));

const countAfterFirst = successful.state.size;
const second = await commitChallengeReviewSubmission(successful.db, transitionInput);
assert.equal(second.idempotent, true);
assert.equal(successful.state.size, countAfterFirst);

const failed = fakeDb({ [`challenges/${challengeId}`]: { id: challengeId, creatorId: "creator-1", status: "draft" } }, true);
await assert.rejects(() => commitChallengeReviewSubmission(failed.db, transitionInput), /simulated atomic commit failure/);
assert.equal(failed.state.get(`challenges/${challengeId}`).status, "draft");
assert.equal(failed.state.has(`challengeReviewRevisions/${revision.id}`), false);
assert.equal(failed.state.has(`auditLogs/${submitAudit.id}`), false);

const route = readFileSync("app/api/challenges/[id]/publish/route.ts", "utf8");
assert.doesNotMatch(route, /allowDoroCoinVotes:\s*undefined/);
assert.match(route, /buildStoredVotingSettings\(body\.votingSettings\)/);
assert.match(route, /commitChallengeReviewSubmission\(db/);
assert.match(route, /SUBMIT_PAYLOAD_INVALID/);
assert.match(route, /storedChallengeFields = sanitizeFirestorePayload\(body, "challengeUpdate"\)/);
assert.doesNotMatch(route, /const update = \{\s*\.\.\.body,/);
assert.match(route, /stage: "payload_validation"/);
assert.match(route, /payloadName/);
assert.match(route, /safePath: error\.fieldPath/);
assert.match(route, /requestId: publishRequestId/);
assert.match(route, /We couldn't submit this challenge because some saved details need attention\./);
assert.ok(route.indexOf("if (transition.idempotent)") < route.indexOf("createNotification(db"), "idempotent retries must return before notification creation");
assert.ok(route.indexOf("commitChallengeReviewSubmission(db") < route.indexOf("createNotification(db"), "notification must follow the critical commit");
assert.doesNotMatch(route.slice(route.indexOf("commitChallengeReviewSubmission(db"), route.indexOf("createNotification(db")), /Promise\.all\(\[\s*db\.collection\("challenges"\)/);

const builder = readFileSync("components/normal-challenge-builder.tsx", "utf8");
const builderSteps = readFileSync("components/normal-challenge-builder-steps.tsx", "utf8");
assert.match(builder, /Submit for Review/);
assert.match(builderSteps, /No fixed capacity\./);
assert.doesNotMatch(builder, />Preview</);
assert.doesNotMatch(builder, />Publish(?: Challenge)?</);

console.log("PASS submit-review-firestore-contracts.mjs");
