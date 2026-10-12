import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const temp = join(root, ".tmp-winner-announcement-gate");
await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
const helper = readFileSync(join(root, "lib/server/official-winner-records.ts"), "utf8");
const flow = readFileSync(join(root, "lib/server/challenge-production-flow.ts"), "utf8")
  .replace('import { getChallengeLifecycleState } from "@/lib/challenge-status";', 'import { getChallengeLifecycleState } from "./stubs.ts";')
  .replace('import { calculatePaidRevenueSplit } from "@/lib/server/payout-structure";', 'import { calculatePaidRevenueSplit } from "./stubs.ts";')
  .replace('import { validateAuthoritativeWinnerRecords, type OfficialWinnerRecord } from "@/lib/server/official-winner-records";', 'import { validateAuthoritativeWinnerRecords } from "./official-winner-records.ts";');
await writeFile(join(temp, "official-winner-records.ts"), helper);
await writeFile(join(temp, "challenge-production-flow.ts"), flow);
await writeFile(join(temp, "stubs.ts"), 'export const getChallengeLifecycleState = () => ({ submissionStatus: "submissions_closed", votingStatus: "voting_closed", primaryStatus: "under_review", participationStatus: "challenge_ended" }); export const calculatePaidRevenueSplit = (value) => ({ grossAmountCents: value, winnerShareCents: value, creatorHostOperatorShareCents: 0, platformAdminShareCents: 0 });');
try {
  const { canAnnounceWinners, lifecycleUpdateForAction } = await import(pathToFileURL(join(temp, "challenge-production-flow.ts")).href);
  const challenge = { id: "c1", status: "under_review", winnersApprovedAt: "approved", builderVersion: "normal_v3", numberOfWinners: 1 };
  const valid = [{ id: "w1", challengeId: "c1", userId: "u1", submissionId: "s1", position: 1, status: "approved" }];
  let assertions = 0;
  function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
  equal(canAnnounceWinners(challenge).allowed, false, "approval without winner records cannot announce");
  equal(canAnnounceWinners({ ...challenge, disputeStatus: "open" }, valid).allowed, false, "open dispute blocks announcement");
  equal(canAnnounceWinners({ ...challenge, status: "cancelled" }, valid).allowed, false, "cancelled challenge is not announced");
  equal(canAnnounceWinners(challenge, valid).allowed, true, "approved valid winner records permit announcement");
  assert.throws(() => lifecycleUpdateForAction("announce_winners", "admin", "2026-01-01T00:00:00.000Z"), /AUTHORITATIVE_WINNER_RECORDS_REQUIRED/);
  assertions += 1;
  const update = lifecycleUpdateForAction("announce_winners", "admin", "2026-01-01T00:00:00.000Z", { challenge, winnerRecords: valid });
  equal(update.status, "winners_announced", "transition update includes the validated result state");
  equal(update.officialWinnerRecordCount, 1, "transition persists verified record count");
  console.log(`PASS winner announcement gate: ${assertions} assertions.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
