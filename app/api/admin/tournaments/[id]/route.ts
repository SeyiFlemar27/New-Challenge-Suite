import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { createHash } from "node:crypto";
import { reconcileTournamentLifecycleAfterStateChange } from "@/lib/server/tournament-match-lifecycle-jobs";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adminTournamentActionFoundation, deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";
import { finalizeTournamentSettlement } from "@/lib/server/tournament-settlement";
import { reconcileTournamentTeamEntitlements } from "@/lib/server/tournament-team-entitlements";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";
import { isTournamentV3SchedulingReady } from "@/lib/server/tournament-cloud-tasks";

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
    db.collection("tournamentMatches").where("tournamentId", "==", id).limit(260).get(),
    db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(520).get(),
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
  const teamEvidence = await db.collection("tournamentTeams").where("tournamentId", "==", id).get();
  // Authorized Admin evidence only; never exposed by the public projection.
  const adminTournament = { id: tournamentSnap.id, ...tournamentSnap.data(), teamEntitlementEvidence: rows(teamEvidence) };
  const impactMatchId = new URL(request.url).searchParams.get("impactMatchId") ?? "";
  const impact = impactMatchId ? deriveTournamentCorrectionImpact(matchRows as Parameters<typeof deriveTournamentCorrectionImpact>[0], impactMatchId) : null;
  const activity = impact ? {
    submissions: rows(submissions).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    votes: rows(votes).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    judging: rows(judgeScores).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    settlementSensitive: impact.hasResolvedDownstream || ["results_under_review", "completed"].includes(String(tournamentSnap.data()?.status ?? ""))
  } : null;
  return ok({ tournament: adminTournament, participants: rows(participants), rounds: rows(rounds), matches: matchRows, submissions: rows(submissions), votes: rows(votes), judges: rows(judges), judgeScores: rows(judgeScores), prizePools: rows(prizePools), sponsorProposals: rows(proposals), reports: rows(reports), disputes: rows(disputes), entryPaymentDisputes: rows(entryPaymentDisputes), audits: rows(audits), correctionImpact: impact ? { ...impact, activity, automaticCorrectionAllowed: impact.futureOnly && !activity?.submissions && !activity?.votes && !activity?.judging && !activity?.settlementSensitive } : null }, "Admin tournament detail loaded.");
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
  if (body.confirmed !== true) return fail("Confirm this Tournament decision before continuing.", 422, undefined, "TOURNAMENT_CONFIRMATION_REQUIRED");
  const now = new Date().toISOString();
  if (action === "reconcile_team_entitlements") {
    const recent = await requireRecentAdminAuthentication(request, "settlements.approve");
    if (recent.response) return recent.response;
    try {
      const decision = String(body.decision);
      if (!["eligible", "temporary_hold", "permanently_ineligible"].includes(decision)) return fail("Select an authoritative eligibility decision.", 422);
      const result = await reconcileTournamentTeamEntitlements(db, { tournamentId: id, teamId: String(body.teamId ?? ""), userId: String(body.userId ?? ""), decision: decision as "eligible" | "temporary_hold" | "permanently_ineligible", adminId: user.uid, reason, evidenceReference: String(body.evidenceReference ?? ""), expectedVersion: Number(body.expectedVersion), idempotencyKey: String(body.idempotencyKey ?? "") });
      const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
      await attemptTournamentNotifications(db, id);
      return ok(result, result.status === "reconciled_unpaid" ? "Unpaid team entitlements reconciled. No payout was executed." : "Eligibility decision recorded. Review the resulting entitlement hold before any release.");
    } catch (error) {
      const code = error instanceof Error && /^TEAM_[A-Z_]+$/.test(error.message) ? error.message : "TEAM_ENTITLEMENT_RECONCILIATION_FAILED";
      return fail("Team entitlements could not be changed safely. Refresh the evidence and current version before retrying.", 409, undefined, code);
    }
  }
  if (action === "approve" || action === "reject" || action === "request_changes") {
    const registrationReady = process.env.NODE_ENV !== "production" || isTournamentV3SchedulingReady();
    const openRegistration = action === "approve" && body.openRegistration === true;
    if (openRegistration && !registrationReady) return fail("Editorial approval is preserved. Registration remains held until durable scheduling is ready.", 503, undefined, "TOURNAMENT_SCHEDULING_UNAVAILABLE");
    try {
      const result = await db.runTransaction(async transaction => {
        const ref = db.collection("tournaments").doc(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error("TOURNAMENT_NOT_FOUND");
        const record = { ...snapshot.data(), id };
        if ([snapshot.data()?.hostId, snapshot.data()?.creatorId].includes(user.uid)) throw new Error("TOURNAMENT_SELF_REVIEW_PROHIBITED");
        const decisionId = createHash("sha256").update(`${id}:${snapshot.data()?.submittedAt ?? "initial"}:${openRegistration ? "open_registration" : action}`).digest("hex");
        const decisionRef = db.collection("tournamentAuditEvents").doc(decisionId), previous = await transaction.get(decisionRef);
        if (previous.exists && snapshot.data()?.lastReviewDecisionId === decisionId) return { status: snapshot.data()?.status, publicationHeld: Boolean(snapshot.data()?.publicationHoldReason), idempotent: true };
        if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== snapshot.data()?.updatedAt) throw new Error("TOURNAMENT_REVIEW_STATE_CHANGED");
        if (openRegistration ? !(snapshot.data()?.status === "scheduled" && snapshot.data()?.reviewStatus === "approved" && snapshot.data()?.publicationHoldReason === "scheduler_unavailable") : snapshot.data()?.status !== "pending_review") throw new Error("TOURNAMENT_REVIEW_STATE_CHANGED");
        const funding = await getTournamentCreatorFunding(db, id, record, transaction);
        if (action === "approve") {
          if (!evaluateTournamentReadiness(record).ready || !snapshot.data()?.creatorMediaVerification) throw new Error("TOURNAMENT_NOT_READY");
          if (Number(snapshot.data()?.basePrizeAmountMinor ?? 0) > funding.confirmedCreatorCents) throw new Error("BASE_PRIZE_FUNDING_REQUIRED");
        }
        const publicationHeld = action === "approve" && !registrationReady;
        const status = action === "approve" ? publicationHeld ? "scheduled" : "registration_open" : "draft";
        const reviewStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
        transaction.update(ref, { status, reviewStatus, publicationHoldReason: publicationHeld ? "scheduler_unavailable" : null, lastReviewDecisionId: decisionId, reviewReason: reason, reviewedBy: user.uid, reviewedAt: now, ...(action === "approve" ? { publishedAt: publicationHeld ? null : now } : {}), updatedAt: now });
        transaction.set(db.collection("tournamentReviewRequests").doc(`${id}_initial`), { status: reviewStatus, reason, reviewedBy: user.uid, reviewedAt: now, updatedAt: now }, { merge: true });
        transaction.create(decisionRef, { tournamentId: id, actorId: user.uid, action: openRegistration ? "tournament_registration_opened" : `tournament_${action}`, reason, createdAt: now, metadata: { previousStatus: snapshot.data()?.status, resultingStatus: status, publicationHeld, paymentActivationChanged: false, externalPayoutExecuted: false } });
        if (snapshot.data()?.hostId) transaction.set(db.collection("notifications").doc(`review_${decisionId}`), { userId: snapshot.data()!.hostId, type: `tournament_${action}`, title: action === "approve" ? "Tournament approved" : action === "reject" ? "Tournament not approved" : "Tournament changes requested", body: publicationHeld ? `${reason} Editorial approval is complete; registration and public discovery are held until scheduling is ready.` : reason, targetId: id, actionUrl: action === "approve" && !publicationHeld ? `/tournaments/${encodeURIComponent(id)}` : challengeReviewBuilderDestination(record, id, "tournaments"), read: false, delivery: { inApp: true, email: false }, createdAt: now });
        if (snapshot.data()?.hostId) transaction.set(db.collection("tournamentEmailOutbox").doc(`review_${decisionId}`), { tournamentId: id, userId: snapshot.data()!.hostId, category: "challengeReminders", title: "Tournament review decision", message: reason, status: "pending", createdAt: now });
        return { status, publicationHeld };
      });
      const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
      await attemptTournamentNotifications(db, id);
      return ok(result, action === "approve" ? result.publicationHeld ? "Tournament approved for content. Registration and public discovery remain on hold until durable scheduling is ready." : "Tournament approved and registration opened. Payment execution settings remain unchanged." : action === "reject" ? "Tournament rejected with feedback. The creator can edit and resubmit." : "Changes requested. The creator can update the draft.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "TOURNAMENT_REVIEW_FAILED";
      const messages: Record<string, string> = { TOURNAMENT_NOT_FOUND: "Tournament not found.", TOURNAMENT_REVIEW_STATE_CHANGED: "This Tournament is no longer awaiting review. Refresh before continuing.", TOURNAMENT_NOT_READY: "Required Tournament information or verified media is incomplete.", BASE_PRIZE_FUNDING_REQUIRED: "The creator's Base Prize is not fully confirmed." };
      return fail(messages[code] ?? "Tournament review could not be completed safely.", code === "TOURNAMENT_NOT_FOUND" ? 404 : 409, undefined, code in messages ? code : "TOURNAMENT_REVIEW_FAILED");
    }
  }
  if (action === "approve_payout_foundation") {
    const recent = await requireRecentAdminAuthentication(request, "settlements.approve");
    if (recent.response) return recent.response;
    try {
      const result = await finalizeTournamentSettlement(db, { tournamentId: id, adminId: user.uid, reason });
      const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
      await attemptTournamentNotifications(db, id);
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
  return fail("This Tournament action has no authorized execution workflow. No state was changed.", 409, { action, payoutProviderCalled: false }, "ADMIN_TOURNAMENT_ACTION_UNAVAILABLE");
}
