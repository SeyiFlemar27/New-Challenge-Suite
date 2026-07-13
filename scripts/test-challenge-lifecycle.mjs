import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const tempDir = join(root, ".tmp-challenge-lifecycle");
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
const source = readFileSync(join(root, "lib/challenge-status.ts"), "utf8").replace('import type { Challenge } from "./types";', 'type Challenge = Record<string, unknown>;');
await writeFile(join(tempDir, "challenge-status.ts"), source, "utf8");
const {
  getChallengeLifecycleState,
  getChallengeDisplayStatus,
  normalizeChallengeDate,
  compareChallengeDates,
  canJoinChallenge,
  canSubmitToChallenge,
  canVoteOnChallenge
} = await import(pathToFileURL(join(tempDir, "challenge-status.ts")).href);

const d = (iso) => new Date(iso);
const base = {
  id: "challenge_lifecycle_test",
  title: "Lifecycle Test",
  status: "scheduled",
  acceptedSubmissionTypes: ["image"],
  registrationOpensAt: "2026-08-01T10:00:00.000Z",
  registrationClosesAt: "2026-08-05T10:00:00.000Z",
  submissionOpensAt: "2026-08-06T10:00:00.000Z",
  submissionClosesAt: "2026-08-10T10:00:00.000Z",
  challengeStartsAt: "2026-08-06T10:00:00.000Z",
  challengeEndsAt: "2026-08-20T10:00:00.000Z",
  votingOpensAt: "2026-08-11T10:00:00.000Z",
  votingClosesAt: "2026-08-18T10:00:00.000Z",
  winnersAnnouncedAt: "2026-08-21T10:00:00.000Z",
  livestreamEnabled: true,
  livestreamUrl: "https://example.com/watch",
  livestreamStartsAt: "2026-08-06T12:00:00.000Z",
  livestreamEndsAt: "2026-08-06T14:00:00.000Z",
  replayEnabled: true,
  replayUrl: "https://example.com/replay"
};

let state = getChallengeLifecycleState(base, d("2026-08-01T09:59:59.000Z"));
assert.equal(state.primaryStatus, "registration_not_open");
assert.equal(state.canJoin, false);
assert.equal(state.actionLabel.startsWith("Registration Opens"), true);

state = getChallengeLifecycleState(base, d("2026-08-01T10:00:00.000Z"));
assert.equal(state.primaryStatus, "registration_open");
assert.equal(state.canJoin, true);
assert.equal(canJoinChallenge(base, d("2026-08-01T10:00:00.000Z")), true);

state = getChallengeLifecycleState(base, d("2026-08-05T10:00:00.001Z"));
assert.equal(state.primaryStatus, "registration_closed");
assert.equal(state.canJoin, false);
assert.equal(getChallengeDisplayStatus(base, d("2026-08-05T10:00:00.001Z")), "Registration Closed");

state = getChallengeLifecycleState(base, d("2026-08-06T10:00:00.000Z"));
assert.equal(state.primaryStatus, "submission_open");
assert.equal(state.submissionStatus, "submissions_open");
assert.equal(state.canSubmit, true);
assert.equal(canSubmitToChallenge(base, d("2026-08-06T10:00:00.000Z")), true);

state = getChallengeLifecycleState(base, d("2026-08-10T10:00:00.001Z"));
assert.equal(state.submissionStatus, "submissions_closed");
assert.equal(state.canSubmit, false);

state = getChallengeLifecycleState(base, d("2026-08-11T09:59:59.000Z"));
assert.equal(state.votingStatus, "voting_not_open");
assert.equal(state.canVote, false);

state = getChallengeLifecycleState(base, d("2026-08-11T10:00:00.000Z"));
assert.equal(state.primaryStatus, "voting_open");
assert.equal(state.votingStatus, "voting_open");
assert.equal(state.canVote, true);
assert.equal(canVoteOnChallenge(base, d("2026-08-11T10:00:00.000Z")), true);

state = getChallengeLifecycleState(base, d("2026-08-18T10:00:00.001Z"));
assert.equal(state.votingStatus, "voting_closed");
assert.equal(state.canVote, false);

state = getChallengeLifecycleState(base, d("2026-08-06T11:59:59.000Z"));
assert.equal(state.livestreamStatus, "livestream_scheduled");
assert.equal(state.canWatchLive, false);
state = getChallengeLifecycleState(base, d("2026-08-06T12:00:00.000Z"));
assert.equal(state.livestreamStatus, "livestream_live");
assert.equal(state.canWatchLive, true);
state = getChallengeLifecycleState(base, d("2026-08-06T14:00:00.001Z"));
assert.equal(state.livestreamStatus, "replay_available");

state = getChallengeLifecycleState(base, d("2026-08-21T10:00:00.000Z"));
assert.equal(state.primaryStatus, "winners_announced");

assert.equal(getChallengeLifecycleState({ ...base, status: "cancelled" }, d("2026-08-11T10:00:00.000Z")).canJoin, false);
assert.equal(getChallengeLifecycleState({ ...base, status: "paused" }, d("2026-08-01T10:00:00.000Z")).canJoin, false);
assert.equal(getChallengeLifecycleState({ ...base, status: "completed" }, d("2026-08-06T10:00:00.000Z")).primaryStatus, "completed");

const legacy = {
  id: "legacy_dates",
  status: "published",
  startDate: "2026-09-01",
  endDate: "2026-09-10",
  registrationDeadline: "2026-08-31",
  votingStartDate: "2026-09-11",
  votingEndDate: "2026-09-15"
};
state = getChallengeLifecycleState(legacy, d("2026-09-12T12:00:00.000Z"));
assert.equal(state.votingStatus, "voting_open");
assert.equal(state.canVote, true);

assert.equal(normalizeChallengeDate("2026-01-01", "end")?.toISOString(), "2026-01-01T23:59:59.999Z");
assert.equal(compareChallengeDates("2026-01-01", "2026-01-02"), -1);

await rm(tempDir, { recursive: true, force: true });
console.log("challenge lifecycle tests passed");
