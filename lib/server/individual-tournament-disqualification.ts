import type { Firestore } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";
import { recoverIndividualTournamentBracket } from "@/lib/server/tournament-bracket-recovery";
import type { TournamentMatchFoundation } from "@/lib/tournament-types";

/** Entry point is the existing recent-authenticated single-Admin route only. */
export async function disqualifyIndividualCompetitor(db: Firestore, input: { tournamentId: string; participantId: string; adminId: string; confirmed: boolean; reason: string; evidenceReference: string }, now = new Date()) {
  if (!input.confirmed || !input.adminId || input.reason.trim().length < 5 || input.evidenceReference.trim().length < 5 || !input.participantId || input.participantId.includes("/")) throw new Error("DISQUALIFICATION_EVIDENCE_REQUIRED");
  const result = await db.runTransaction(async transaction => {
    const tournament = await transaction.get(db.collection("tournaments").doc(input.tournamentId));
    const participantRef = db.collection("tournamentParticipants").doc(input.participantId), participant = await transaction.get(participantRef);
    if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!) || !participant.exists || participant.data()?.tournamentId !== input.tournamentId) throw new Error("DISQUALIFICATION_PARTICIPANT_INVALID");
    if (participant.data()?.status === "disqualified") return { idempotent: true, affectedMatchIds: [] as string[] };
    const matches = await transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", input.tournamentId).limit(131));
    const submissions = await transaction.get(db.collection("tournamentSubmissions").where("tournamentId", "==", input.tournamentId).limit(131));
    const credits = await transaction.get(db.collection("cashLedger").where("challengeId", "==", input.tournamentId).limit(131));
    if ([matches.size, submissions.size, credits.size].some(size => size > 130)) throw new Error("DISQUALIFICATION_RECONCILIATION_REQUIRED");
    const rows = matches.docs.map(row => ({ ...row.data(), id: row.id })) as unknown as TournamentMatchFoundation[];
    const assigned = rows.filter(row => [row.participantAId, row.participantBId].includes(input.participantId));
    const affected = new Set(assigned.flatMap(row => deriveTournamentCorrectionImpact(rows, row.id).affectedMatchIds));
    const candidates = rows.filter(row => affected.has(row.id));
    const voteChecks: FirebaseFirestore.QuerySnapshot[] = [];
    for (const row of candidates) voteChecks.push(await transaction.get(db.collection("tournamentVotes").where("matchId", "==", row.id).limit(1)));
    const untouched = new Set(candidates.filter((row, index) => ["scheduled", "ready", "submissions_open"].includes(row.status) && voteChecks[index].empty && !submissions.docs.some(submission => submission.data().matchId === row.id)).map(row => row.id));
    transaction.update(participantRef, { status: "disqualified", disqualifiedAt: now.toISOString(), disqualifiedBy: input.adminId, disqualificationReason: input.reason, disqualificationEvidenceReference: input.evidenceReference, updatedAt: now.toISOString() });
    // Existing legitimate losses and recorded results are never overwritten.
    for (const match of matches.docs.filter(row => affected.has(row.id))) {
      if (["confirmed", "forfeit", "bye", "completed"].includes(String(match.data().status))) continue;
      transaction.update(match.ref, { status: "held", dependencyHoldReason: "ADMIN_DISQUALIFICATION", disqualificationRecoveryAllowed: untouched.has(match.id), heldPreviousStatus: match.data().status, updatedAt: now.toISOString() });
    }
    for (const credit of credits.docs.filter(row => row.data().userId === participant.data()?.userId && ["challenge_winner_prize", "sponsor_prize"].includes(String(row.data().sourceType)))) {
      const data = credit.data(), withdrawn = data.externalPayoutExecuted === true || data.paid === true || Number(data.withdrawnAmountCents ?? 0) > 0;
      if (!withdrawn) transaction.update(credit.ref, { disputeRestricted: true, financialRestriction: "INDIVIDUAL_DISQUALIFICATION_REVIEW", updatedAt: now.toISOString() });
      transaction.set(db.collection("tournamentSettlementHolds").doc(`${credit.id}_disqualification`), { tournamentId: input.tournamentId, participantId: input.participantId, creditId: credit.id, status: withdrawn ? "manual_recovery_required" : "pending_correction", externalPayoutReversed: false, reason: input.reason, evidenceReference: input.evidenceReference, createdAt: now.toISOString() }, { merge: true });
    }
    transaction.create(db.collection("tournamentExceptions").doc(`${input.participantId}_disqualification`), { tournamentId: input.tournamentId, participantId: input.participantId, status: "open", type: "disqualification", affectedMatchIds: [...affected], reason: input.reason, evidenceReference: input.evidenceReference, createdAt: now.toISOString() });
    transaction.create(db.collection("tournamentAuditEvents").doc(`${input.participantId}_disqualified`), { tournamentId: input.tournamentId, actorId: input.adminId, action: "competitor_disqualified", reason: input.reason, createdAt: now.toISOString(), metadata: { targetCompetitorIds: [input.participantId], affectedMatchIds: [...affected], evidenceReference: input.evidenceReference, legitimateLossCountPreserved: participant.data()?.lossCount ?? 0 } });
    return { idempotent: false, affectedMatchIds: [...affected] };
  });
  // The disqualification is already committed. A derivative recovery failure
  // must not be reported as a failed disqualification or release its holds.
  const recovery = await recoverIndividualTournamentBracket(db, input.tournamentId, now)
    .catch(() => ({ status: "pending_recovery", reason: "RECOVERY_RETRY_REQUIRED" }));
  return { ...result, recovery, payoutProviderCalled: false, externalPayoutReversed: false };
}
