const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const challengeId = String(args.challengeId ?? "");
const userId = String(args.userId ?? "");
if (!challengeId) {
  console.error("Usage: node scripts/inspect-challenge-participant-journey.mjs --challengeId=<id> [--userId=<id>]");
  process.exit(1);
}

let getAdminDb;
try {
  ({ getAdminDb } = await import("../lib/firebase/admin.ts"));
} catch {
  console.log(JSON.stringify({ challengeId, available: false, reason: "approved_environment_access_required" }, null, 2));
  process.exit(0);
}
const db = getAdminDb();
if (!db) {
  console.log(JSON.stringify({ challengeId, available: false, reason: "approved_environment_access_required" }, null, 2));
  process.exit(0);
}
const challengeSnap = await db.collection("challenges").doc(challengeId).get();
if (!challengeSnap.exists) {
  console.log(JSON.stringify({ challengeId, found: false }, null, 2));
  process.exit(0);
}
const challenge = challengeSnap.data() ?? {};
const normalizedTimeline = {
  registrationEndAt: challenge.registrationEndAt ?? challenge.registrationClosesAt ?? challenge.registrationDeadline ?? null,
  submissionStartAt: challenge.submissionStartAt ?? challenge.submissionOpensAt ?? challenge.registrationEndAt ?? challenge.registrationDeadline ?? null,
  submissionDeadline: challenge.submissionDeadline ?? challenge.submissionEndAt ?? challenge.submissionClosesAt ?? null,
  votingStartAt: challenge.votingStartAt ?? challenge.votingOpensAt ?? challenge.votingStartsAt ?? null,
  votingEndAt: challenge.votingEndAt ?? challenge.votingClosesAt ?? challenge.votingDeadline ?? null
};
const output = {
  challengeId,
  found: true,
  status: challenge.status ?? null,
  lifecycleStatus: challenge.lifecycleStatus ?? null,
  officialTimezone: challenge.timezone ?? challenge.timeZone ?? "Africa/Lagos",
  normalizedTimeline,
  participantJourney: null
};
if (userId) {
  const [participantSnap, paymentSnap, submissionSnap, requestSnap] = await Promise.all([
    db.collection("challengeParticipants").doc(`${challengeId}_${userId}`).get(),
    db.collection("challengeEntryPayments").doc(`challenge_entry_fee_${challengeId}_${userId}`).get(),
    db.collection("submissions").doc(`${challengeId}_${userId}`).get(),
    db.collection("challengeEntryRequests").doc(`${challengeId}_${userId}`).get()
  ]);
  const participantState = participantSnap.exists ? participantSnap.data()?.status ?? null : null;
  const paymentState = paymentSnap.exists ? paymentSnap.data()?.status ?? null : null;
  const submissionState = submissionSnap.exists ? submissionSnap.data()?.status ?? null : null;
  const entryRequestState = requestSnap.exists ? requestSnap.data()?.status ?? null : null;
  output.participantJourney = {
    viewerRelationship: participantSnap.exists ? "participant" : "viewer",
    participantState,
    paymentState,
    submissionState,
    entryRequestState,
    blockers: [
      !participantSnap.exists ? "not_enrolled" : null,
      paymentState && !["paid", "confirmed"].includes(String(paymentState)) ? "payment_not_confirmed" : null,
      submissionSnap.exists ? "already_submitted" : null
    ].filter(Boolean),
    nextAction: submissionSnap.exists ? "view_entry" : participantSnap.exists ? "check_submission_access" : entryRequestState === "pending" ? "wait_for_approval" : "register_or_request_entry"
  };
}
console.log(JSON.stringify(output, null, 2));
