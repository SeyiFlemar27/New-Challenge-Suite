import type { Firestore } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { recoverIndividualTournamentBracket } from "@/lib/server/tournament-bracket-recovery";

/** A persisted Admin work queue, not an unapproved external alert delivery. */
export async function escalateOverdueIndividualReviews(db: Firestore, tournamentId: string, now = new Date()) {
  return db.runTransaction(async tx => {
    const tournament = await tx.get(db.collection("tournaments").doc(tournamentId));
    if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!)) return { escalated: 0 };
    const cases = await tx.get(db.collection("tournamentDisputes").where("tournamentId", "==", tournamentId).limit(131));
    if (cases.size > 130) throw new Error("REVIEW_ESCALATION_RECONCILIATION_REQUIRED");
    const due = cases.docs.filter(row => row.data().status === "open" && !row.data().escalatedAt && Number.isFinite(Date.parse(String(row.data().reviewDueAt))) && Date.parse(String(row.data().reviewDueAt)) <= now.getTime());
    for (const row of due) {
      tx.update(row.ref, { escalatedAt: now.toISOString(), escalationStatus: "awaiting_admin", updatedAt: now.toISOString() });
      tx.create(db.collection("tournamentReviewEscalations").doc(row.id), { tournamentId, caseId: row.id, matchId: row.data().matchId, status: "open", affectedMatchIds: row.data().affectedMatchIds ?? [], reason: "REVIEW_DEADLINE_EXCEEDED", createdAt: now.toISOString(), externalNotificationDelivered: false });
      tx.create(db.collection("tournamentAuditEvents").doc(`${row.id}_overdue`), { tournamentId, actorId: "system_tournament_lifecycle", action: "individual_review_overdue", createdAt: now.toISOString(), metadata: { caseId: row.id, matchId: row.data().matchId } });
    }
    return { escalated: due.length };
  });
}

/** Locked D24: a review can recheck real eligibility; it cannot choose a winner. */
export async function reviewIndividualStructuralConflict(db: Firestore, input: { tournamentId: string; matchId: string; adminId: string; reason: string; evidenceReference: string; requestKey: string }, now = new Date()) {
  if (!input.adminId || input.reason.trim().length < 5 || input.evidenceReference.trim().length < 5 || !/^[\w-]{8,100}$/.test(input.requestKey)) throw new Error("STRUCTURAL_REVIEW_EVIDENCE_REQUIRED");
  const result = await db.runTransaction(async tx => {
    const [tournament, match] = await tx.getAll(db.collection("tournaments").doc(input.tournamentId), db.collection("tournamentMatches").doc(input.matchId));
    if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!) || tournament.data()?.format !== "double_elimination" || !match.exists || match.data()?.tournamentId !== input.tournamentId || match.data()?.bracket !== "winners" || match.data()?.status !== "double_forfeit_hold") throw new Error("STRUCTURAL_DOUBLE_FORFEIT_REQUIRED");
    const competitors = await tx.getAll(...[match.data()?.participantAId, match.data()?.participantBId].map(id => db.collection("tournamentParticipants").doc(String(id))));
    if (competitors.some(row => !row.exists || row.data()?.tournamentId !== input.tournamentId)) throw new Error("STRUCTURAL_COMPETITORS_REQUIRED");
    const eligible = competitors.filter(row => Number(row.data()?.lossCount) === 1 && !["disqualified", "withdrawn", "refunded", "rejected"].includes(String(row.data()?.status)));
    const ref = db.collection("tournamentStructuralReviews").doc(`${input.matchId}_${input.requestKey}`);
    const prior = await tx.get(ref);
    const status = eligible.length === 2 ? "held_locked_policy_conflict" : "eligibility_recheck_requested";
    if (!prior.exists) {
      tx.create(ref, { tournamentId: input.tournamentId, matchId: input.matchId, status, actorId: input.adminId, reason: input.reason, evidenceReference: input.evidenceReference, eligibleParticipantIds: eligible.map(row => row.id), legitimateLosses: competitors.map(row => ({ participantId: row.id, lossCount: row.data()?.lossCount })), createdAt: now.toISOString(), playInCreated: false, winnerSelected: false });
      tx.create(db.collection("tournamentAuditEvents").doc(`structural_${ref.id}`), { tournamentId: input.tournamentId, actorId: input.adminId, action: "individual_structural_review", reason: input.reason, createdAt: now.toISOString(), metadata: { matchId: input.matchId, status, evidenceReference: input.evidenceReference, targetCompetitorIds: eligible.map(row => row.id) } });
    }
    return { status, eligibleCount: eligible.length, policyConflict: eligible.length === 2 ? "TWO_FIRST_LOSS_COMPETITORS_ONE_LOSER_FEED_NO_AUTHORIZED_SELECTION" : null };
  });
  const recovery = await recoverIndividualTournamentBracket(db, input.tournamentId, now).catch(() => ({ status: "pending_recovery" }));
  return { ...result, recovery, playInCreated: false, winnerSelected: false };
}
