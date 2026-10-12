import { getAdminDb } from "@/lib/firebase/admin";
import { reconcileTournamentLifecycleAfterStateChange } from "@/lib/server/tournament-match-lifecycle-jobs";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adminTournamentActionFoundation, deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";
import { finalizeTournamentSettlement } from "@/lib/server/tournament-settlement";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminPermission(request, "challenges.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament detail");
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const [participants, rounds, matches, submissions, votes, judges, judgeScores, prizePools, proposals, reports, disputes, entryPaymentDisputes, audits] = await Promise.all([
    db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentMatches").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentVotes").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentJudges").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentJudgeScores").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentPrizePools").where("tournamentId", "==", id).limit(20).get(),
    db.collection("tournamentSponsorProposals").where("tournamentId", "==", id).limit(50).get(),
    db.collection("tournamentReports").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentDisputes").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentEntryDisputes").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentAuditEvents").where("tournamentId", "==", id).limit(100).get()
  ]);
  const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  } as Record<string, unknown> & { id: string }));
  const matchRows = rows(matches);
  const impactMatchId = new URL(request.url).searchParams.get("impactMatchId") ?? "";
  const impact = impactMatchId ? deriveTournamentCorrectionImpact(matchRows as Parameters<typeof deriveTournamentCorrectionImpact>[0], impactMatchId) : null;
  const activity = impact ? {
    submissions: rows(submissions).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    votes: rows(votes).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    judging: rows(judgeScores).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    settlementSensitive: impact.hasResolvedDownstream || ["results_under_review", "completed"].includes(String(tournamentSnap.data()?.status ?? ""))
  } : null;
  return ok({ tournament: { id: tournamentSnap.id, ...tournamentSnap.data() }, participants: rows(participants), rounds: rows(rounds), matches: matchRows, submissions: rows(submissions), votes: rows(votes), judges: rows(judges), judgeScores: rows(judgeScores), prizePools: rows(prizePools), sponsorProposals: rows(proposals), reports: rows(reports), disputes: rows(disputes), entryPaymentDisputes: rows(entryPaymentDisputes), audits: rows(audits), correctionImpact: impact ? { ...impact, activity, automaticCorrectionAllowed: impact.futureOnly && !activity?.submissions && !activity?.votes && !activity?.judging && !activity?.settlementSensitive } : null }, "Admin tournament detail loaded.");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdminPermission(request, "challenges.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament action");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").slice(0, 500);
  const { id } = await context.params;
  const foundation = adminTournamentActionFoundation(action);
  if (!foundation.adminRequired) return fail("Unsupported admin tournament action.", 400, foundation, "ADMIN_TOURNAMENT_ACTION_UNSUPPORTED");
  if (reason.length < 5) return fail("Admin tournament actions require a reason.", 400, foundation, "ADMIN_TOURNAMENT_REASON_REQUIRED");
  const now = new Date().toISOString();
  if (action === "approve_payout_foundation") {
    try {
      const result = await finalizeTournamentSettlement(db, { tournamentId: id, adminId: user.uid, reason });
      return ok({ action, ...result, auditRequired: true, payoutProviderCalled: false }, result.settlement.idempotent ? "Official placements were already finalized; the existing internal settlement was returned." : "Official Tournament placements finalized and internal settlement prepared. No external payout was executed.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "TOURNAMENT_SETTLEMENT_FAILED";
      const messages: Record<string, string> = {
        TOURNAMENT_NOT_FOUND: "Tournament not found.",
        TOURNAMENT_RESULTS_NOT_FINAL: "Tournament results must be under review before Admin finalization.",
        TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED: "Competition-derived official placements are required.",
        TOURNAMENT_CREATOR_REVIEW_REQUIRED: "The Creator or Host must review the competition-derived placements first.",
        TOURNAMENT_SETTLEMENT_CORRECTION_REQUIRED: "A settlement-sensitive result correction requires Finance review.",
        TOURNAMENT_PLACEMENT_SOURCE_MATCH_INVALID: "A placement does not match a confirmed competition result. Admin finalization is blocked.",
        TOURNAMENT_PLACEMENT_PARTICIPANT_INVALID: "A placed participant record needs Admin review.",
        TOURNAMENT_LOCKED_ROSTER_REQUIRED: "A placed Team requires its canonical locked roster before settlement.",
        TOURNAMENT_FINANCIAL_HOLD: "Tournament entry refunds or disputes require reconciliation before settlement."
      };
      return fail(messages[code] ?? "Tournament settlement could not be prepared safely.", code === "TOURNAMENT_NOT_FOUND" ? 404 : 409, { payoutProviderCalled: false }, code);
    }
  }
  if (action === "submission_approved" || action === "submission_rejected") {
    const submissionId = String(body.submissionId ?? "").trim();
    if (!submissionId) return fail("Choose a Tournament submission to review.", 400, undefined, "TOURNAMENT_SUBMISSION_REQUIRED");
    const submissionRef = db.collection("tournamentSubmissions").doc(submissionId);
    let result: { idempotent: boolean; status: string; matchId: string; configVersion: number };
    try {
      result = await db.runTransaction(async (transaction) => {
      const submissionSnap = await transaction.get(submissionRef);
      if (!submissionSnap.exists || submissionSnap.data()?.tournamentId !== id) throw Object.assign(new Error("TOURNAMENT_SUBMISSION_NOT_FOUND"), { code: "TOURNAMENT_SUBMISSION_NOT_FOUND" });
      const submission = submissionSnap.data() ?? {};
      const matchId = String(submission.matchId ?? "");
      if (!matchId) throw Object.assign(new Error("TOURNAMENT_SUBMISSION_MATCH_MISSING"), { code: "TOURNAMENT_SUBMISSION_MATCH_MISSING" });
      const matchRef = db.collection("tournamentMatches").doc(matchId);
      const [tournamentSnap, matchSnap] = await Promise.all([transaction.get(db.collection("tournaments").doc(id)), transaction.get(matchRef)]);
      if (!tournamentSnap.exists || !matchSnap.exists || matchSnap.data()?.tournamentId !== id || matchSnap.data()?.roundId !== submission.roundId || ![matchSnap.data()?.participantAId, matchSnap.data()?.participantBId].includes(submission.participantId)) throw Object.assign(new Error("TOURNAMENT_SUBMISSION_ASSIGNMENT_INVALID"), { code: "TOURNAMENT_SUBMISSION_ASSIGNMENT_INVALID" });
      const targetStatus = action === "submission_approved" ? "approved" : "rejected";
      const currentStatus = String(submission.status ?? "");
      const configVersion = Number(tournamentSnap.data()?.configVersion ?? 1);
      if (currentStatus === targetStatus) return { idempotent: true, status: targetStatus, matchId, configVersion };
      if (!["submitted", "pending_moderation", "under_review"].includes(currentStatus) || !["submissions_open", "submission_review"].includes(String(matchSnap.data()?.status ?? ""))) throw Object.assign(new Error("TOURNAMENT_SUBMISSION_REVIEW_CLOSED"), { code: "TOURNAMENT_SUBMISSION_REVIEW_CLOSED" });
      transaction.set(submissionRef, { status: targetStatus, reviewedAt: now, reviewedBy: user.uid, reviewReason: reason, updatedAt: now }, { merge: true });
      const reviewRef = db.collection("tournamentSubmissionReviews").doc(`${submissionId}_${action}`);
      transaction.create(reviewRef, { id: reviewRef.id, tournamentId: id, submissionId, matchId, roundId: submission.roundId, participantId: submission.participantId, action, status: targetStatus, actorId: user.uid, reason, createdAt: now });
      const auditRef = db.collection("tournamentAuditEvents").doc(`${id}_${action}_${submissionId}`);
      transaction.create(auditRef, { id: auditRef.id, tournamentId: id, actorId: user.uid, action, reason, createdAt: now, metadata: { submissionId, matchId, roundId: submission.roundId, participantId: submission.participantId, previousStatus: currentStatus, resultingStatus: targetStatus } });
        return { idempotent: false, status: targetStatus, matchId, configVersion };
      });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "TOURNAMENT_SUBMISSION_REVIEW_FAILED";
      const message = code === "TOURNAMENT_SUBMISSION_NOT_FOUND" ? "Tournament submission not found." : code === "TOURNAMENT_SUBMISSION_ASSIGNMENT_INVALID" ? "This submission is not assigned to the selected Tournament match." : "This submission can no longer be reviewed in its current state.";
      return fail(message, code === "TOURNAMENT_SUBMISSION_NOT_FOUND" ? 404 : 409, undefined, code);
    }
    if (!result.idempotent && result.configVersion >= 3) {
      try { await reconcileTournamentLifecycleAfterStateChange(db, id, new Date(), [result.matchId]); }
      catch (error) { console.error("Tournament moderation job reconciliation failed", { tournamentId: id, matchId: result.matchId, code: error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code).slice(0, 80) : "RECONCILIATION_FAILED" }); }
    }
    const { configVersion: _configVersion, ...publicResult } = result;
    return ok({ action, submissionId, ...publicResult }, result.idempotent ? "This Tournament submission already has that review outcome." : `Tournament submission ${result.status}.`);
  }
  await db.collection("tournamentAuditEvents").doc(`${id}_${action}_${now}`).set({ id: `${id}_${action}_${now}`, tournamentId: id, actorId: user.uid, action, reason, createdAt: now, metadata: { foundation } });
  return ok({ action, auditRequired: true, payoutProviderCalled: false, balanceOverwriteAllowed: false, rawVoteTotalEditable: false }, "Admin tournament action was audited. No payout, refund, raw vote edit, or balance overwrite occurred.");
}
