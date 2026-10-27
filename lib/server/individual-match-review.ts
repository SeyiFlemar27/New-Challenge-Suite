import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";
import type { TournamentMatchFoundation } from "@/lib/tournament-types";

/** Recent-authenticated Admin only. This workflow never chooses a different winner. */
export async function reviewIndividualMatch(db: Firestore, input: { tournamentId: string; matchId: string; adminId: string; decision: "hold" | "confirm_existing_result"; reason: string; evidenceReference: string; requestKey: string }, now = new Date()) {
  if (!input.adminId || input.reason.trim().length < 5 || input.evidenceReference.trim().length < 5 || !/^[\w-]{8,100}$/.test(input.requestKey) || !["hold", "confirm_existing_result"].includes(input.decision)) throw new Error("MATCH_REVIEW_EVIDENCE_REQUIRED");
  const caseId = createHash("sha256").update(`${input.tournamentId}|${input.matchId}|${input.requestKey}`).digest("hex");
  return db.runTransaction(async transaction => {
    const tournament = await transaction.get(db.collection("tournaments").doc(input.tournamentId));
    if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!)) throw new Error("MATCH_REVIEW_POLICY_REQUIRED");
    const matches = await transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", input.tournamentId).limit(131));
    const cases = await transaction.get(db.collection("tournamentDisputes").where("tournamentId", "==", input.tournamentId).limit(131));
    const placements = await transaction.get(db.collection("tournamentPlacements").where("tournamentId", "==", input.tournamentId).limit(5));
    const credits = await transaction.get(db.collection("cashLedger").where("challengeId", "==", input.tournamentId).limit(131));
    if ([matches.size, cases.size, credits.size].some(size => size > 130)) throw new Error("MATCH_REVIEW_RECONCILIATION_REQUIRED");
    const source = matches.docs.find(row => row.id === input.matchId);
    if (!source) throw new Error("MATCH_REVIEW_SOURCE_REQUIRED");
    const previous = cases.docs.find(row => row.id === caseId);
    if (input.decision === "hold" && previous) return { status: String(previous.data().status), idempotent: true, caseId };
    if (input.decision === "confirm_existing_result" && previous?.data().status === "resolved") return { status: "resolved", idempotent: true, caseId };
    const impacted = new Set(deriveTournamentCorrectionImpact(matches.docs.map(row => ({ ...row.data(), id: row.id })) as unknown as TournamentMatchFoundation[], input.matchId).affectedMatchIds);
    const positions = new Set(placements.docs.filter(row => impacted.has(String(row.data().sourceMatchId))).map(row => Number(row.data().placement)));
    const affectedCredits = credits.docs.filter(row => positions.has(Number(row.data().placement)) && ["challenge_winner_prize", "sponsor_prize"].includes(String(row.data().sourceType)));
    const withdrawalRows = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const credit of affectedCredits) {
      const rows = await transaction.get(db.collection("withdrawalRequests").where("sourceIds", "array-contains", credit.id).limit(101));
      if (rows.size > 100) throw new Error("MATCH_REVIEW_WITHDRAWAL_RECONCILIATION_REQUIRED");
      for (const row of rows.docs) withdrawalRows.set(row.id, row);
    }
    const ref = db.collection("tournamentDisputes").doc(caseId);
    if (input.decision === "hold") {
      const snapshots = matches.docs.filter(row => impacted.has(row.id)).map(row => {
        const overlapping = cases.docs.filter(other => other.data().status === "open" && other.data().affectedMatchIds?.includes(row.id)).sort((a, b) => String(a.data().createdAt).localeCompare(String(b.data().createdAt)))[0];
        const original = overlapping?.data().snapshots?.find((item: { id: string }) => item.id === row.id);
        return original ?? { id: row.id, status: row.data().status, resultStatus: row.data().resultStatus ?? null, submissionDeadlineAt: row.data().submissionDeadlineAt ?? null, votingClosesAt: row.data().votingClosesAt ?? null, reviewStartedAt: now.toISOString(), dependencyHoldReason: row.data().dependencyHoldReason ?? null, participantAId: row.data().participantAId ?? null, participantBId: row.data().participantBId ?? null, winnerParticipantId: row.data().winnerParticipantId ?? null, loserParticipantId: row.data().loserParticipantId ?? null };
      });
      const withdrawalSnapshots = [...withdrawalRows.values()].map(row => {
        const overlapping = cases.docs.filter(other => other.data().status === "open" && other.data().withdrawalSnapshots?.some((item: { id: string }) => item.id === row.id)).sort((a, b) => String(a.data().createdAt).localeCompare(String(b.data().createdAt)))[0];
        return overlapping?.data().withdrawalSnapshots?.find((item: { id: string }) => item.id === row.id) ?? { id: row.id, financialHold: row.data().financialHold === true, riskStatus: row.data().riskStatus ?? null };
      });
      transaction.create(ref, { tournamentId: input.tournamentId, matchId: input.matchId, status: "open", reason: input.reason, evidenceReference: input.evidenceReference, openedBy: input.adminId, createdAt: now.toISOString(), reviewDueAt: new Date(now.getTime() + 72 * 3_600_000).toISOString(), affectedMatchIds: [...impacted], affectedCreditIds: affectedCredits.map(row => row.id), snapshots, withdrawalSnapshots });
      for (const row of withdrawalRows.values()) if (!["paid", "paid_out", "succeeded", "completed", "rejected", "cancelled", "failed"].includes(String(row.data().status))) transaction.update(row.ref, { financialHold: true, riskStatus: "held", tournamentReviewCaseIds: [...new Set([...(row.data().tournamentReviewCaseIds ?? []), caseId])], updatedAt: now.toISOString() });
      for (const row of matches.docs.filter(row => impacted.has(row.id))) transaction.update(row.ref, { ...(["confirmed", "forfeit", "bye", "completed"].includes(String(row.data().status)) ? { resultStatus: "under_review" } : { status: "held" }), reviewRestricted: true, updatedAt: now.toISOString() });
      for (const credit of affectedCredits) {
        transaction.update(credit.ref, { disputeRestricted: true, financialRestriction: credit.data().financialRestriction || (credit.data().disputeRestricted === true ? "PRIOR_DISPUTE_HOLD" : "INDIVIDUAL_MATCH_REVIEW"), updatedAt: now.toISOString() });
        if (credit.data().paid === true || credit.data().externalPayoutExecuted === true || Number(credit.data().withdrawnAmountCents ?? 0) > 0) transaction.set(db.collection("tournamentSettlementHolds").doc(caseId + "_" + credit.id), { tournamentId: input.tournamentId, caseId, creditId: credit.id, status: "manual_recovery_required", externalPayoutReversed: false, reason: input.reason, createdAt: now.toISOString() }, { merge: true });
      }
    } else {
      const prior = previous?.data();
      if (!prior || prior.status !== "open" || !Array.isArray(prior.snapshots)) throw new Error("MATCH_REVIEW_OPEN_CASE_REQUIRED");
      if (prior.competitivePolicyRequired === true) throw new Error("MATCH_REVIEW_COMPETITIVE_POLICY_REQUIRED");
      const elapsed = now.getTime() - Date.parse(String(prior.createdAt));
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("MATCH_REVIEW_TIME_INVALID");
      for (const row of matches.docs.filter(row => prior.affectedMatchIds.includes(row.id))) {
        if (cases.docs.some(other => other.id !== caseId && other.data().status === "open" && other.data().affectedMatchIds?.includes(row.id))) continue;
        const original = prior.snapshots.find((item: { id: string }) => item.id === row.id);
        if (!original || row.data().reviewRestricted !== true || !["held", "confirmed", "forfeit", "bye", "completed"].includes(String(row.data().status))) throw new Error("MATCH_REVIEW_STATE_CHANGED");
        if (["participantAId", "participantBId", "winnerParticipantId", "loserParticipantId", "dependencyHoldReason"].some(key => (row.data()[key] ?? null) !== (original[key] ?? null))) throw new Error("MATCH_REVIEW_STATE_CHANGED");
        const duration = now.getTime() - Date.parse(String(original.reviewStartedAt ?? prior.createdAt));
        if (!Number.isFinite(duration) || duration < 0) throw new Error("MATCH_REVIEW_TIME_INVALID");
        const shift = (value: unknown) => value && Number.isFinite(Date.parse(String(value))) ? new Date(Date.parse(String(value)) + duration).toISOString() : null;
        transaction.update(row.ref, { status: original.status, resultStatus: original.resultStatus, submissionDeadlineAt: shift(original.submissionDeadlineAt), votingClosesAt: shift(original.votingClosesAt), reviewRestricted: false, updatedAt: now.toISOString() });
      }
      for (const credit of affectedCredits) if (credit.data().financialRestriction === "INDIVIDUAL_MATCH_REVIEW" && !cases.docs.some(other => other.id !== caseId && other.data().status === "open" && other.data().affectedCreditIds?.includes(credit.id))) transaction.update(credit.ref, { disputeRestricted: false, financialRestriction: null, updatedAt: now.toISOString() });
      for (const row of withdrawalRows.values()) {
        const remaining = (Array.isArray(row.data().tournamentReviewCaseIds) ? row.data().tournamentReviewCaseIds as string[] : []).filter(id => id !== caseId);
        const original = prior.withdrawalSnapshots?.find((item: { id: string }) => item.id === row.id);
        if (original && !remaining.length && row.data().financialHold === true && row.data().riskStatus === "held" && !row.data().correctionRevisionId) transaction.update(row.ref, { financialHold: original.financialHold, riskStatus: original.riskStatus, tournamentReviewCaseIds: [], updatedAt: now.toISOString() });
        else if (original) transaction.update(row.ref, { tournamentReviewCaseIds: remaining, updatedAt: now.toISOString() });
      }
      transaction.update(ref, { status: "resolved", resolution: "existing_result_confirmed_without_alteration", resolvedBy: input.adminId, resolutionReason: input.reason, resolutionEvidenceReference: input.evidenceReference, resolvedAt: now.toISOString() });
      if (prior.escalatedAt) transaction.set(db.collection("tournamentReviewEscalations").doc(caseId), { status: "resolved", resolvedBy: input.adminId, resolvedAt: now.toISOString() }, { merge: true });
    }
    transaction.create(db.collection("tournamentAuditEvents").doc(`${caseId}_${input.decision}`), { tournamentId: input.tournamentId, actorId: input.adminId, action: `individual_match_${input.decision}`, reason: input.reason, createdAt: now.toISOString(), metadata: { caseId, matchId: input.matchId, affectedMatchIds: [...impacted], evidenceReference: input.evidenceReference, noWinnerOrVotesChanged: true } });
    return { status: input.decision === "hold" ? "open" : "resolved", idempotent: false, caseId };
  });
}
