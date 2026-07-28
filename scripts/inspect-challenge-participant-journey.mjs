
const challengeId = process.argv[2];
const viewerId = process.argv[3] || null;
if (!challengeId) {
  console.error("Usage: node scripts/inspect-challenge-participant-journey.mjs <challengeId> [viewerId]");
  process.exit(1);
}
let getAdminDb;
try {
  ({ getAdminDb } = await import("../lib/firebase/admin.ts"));
} catch {
  console.log(JSON.stringify({ challengeId, found: false, reason: "admin_helper_unavailable" }, null, 2));
  process.exit(0);
}
const db = getAdminDb();
if (!db) {
  console.log(JSON.stringify({ challengeId, available: false, reason: "admin_not_configured" }, null, 2));
  process.exit(0);
}
const challengeSnap = await db.collection("challenges").doc(challengeId).get();
if (!challengeSnap.exists) {
  console.log(JSON.stringify({ challengeId, found: false }, null, 2));
  process.exit(0);
}
const challenge = challengeSnap.data() ?? {};
const output = { challengeId, found: true, status: challenge.status ?? null, lifecycleStatus: challenge.lifecycleStatus ?? null, registrationEndAt: challenge.registrationEndAt ?? challenge.registrationClosesAt ?? challenge.registrationDeadline ?? null, submissionStartAt: challenge.submissionStartAt ?? challenge.submissionOpensAt ?? null, submissionDeadline: challenge.submissionDeadline ?? challenge.submissionEndAt ?? challenge.submissionClosesAt ?? null, votingStartAt: challenge.votingStartAt ?? challenge.votingOpensAt ?? null, votingEndAt: challenge.votingEndAt ?? challenge.votingClosesAt ?? challenge.votingDeadline ?? null, viewer: null };
if (viewerId) {
  const [participantSnap, paymentSnap, submissionSnap, requestSnap] = await Promise.all([
    db.collection("challengeParticipants").doc(`${challengeId}_${viewerId}`).get(),
    db.collection("challengeEntryPayments").doc(`challenge_entry_fee_${challengeId}_${viewerId}`).get(),
    db.collection("submissions").doc(`${challengeId}_${viewerId}`).get(),
    db.collection("challengeEntryRequests").doc(`${challengeId}_${viewerId}`).get()
  ]);
  output.viewer = { participantStatus: participantSnap.exists ? participantSnap.data()?.status ?? null : null, paymentStatus: paymentSnap.exists ? paymentSnap.data()?.status ?? null : null, reservationStatus: paymentSnap.exists ? paymentSnap.data()?.reservationStatus ?? null : null, submissionStatus: submissionSnap.exists ? submissionSnap.data()?.status ?? null : null, requestStatus: requestSnap.exists ? requestSnap.data()?.status ?? null : null };
}
console.log(JSON.stringify(output, null, 2));

