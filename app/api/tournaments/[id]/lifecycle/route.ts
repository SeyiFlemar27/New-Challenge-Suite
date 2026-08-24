import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { advanceWinner, resolveTournamentNoSubmission } from "@/lib/server/tournament-operations";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import type { TournamentFoundation, TournamentMatchFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";
const dateMs = (value: unknown) => { const result = new Date(String(value ?? "")).getTime(); return Number.isFinite(result) ? result : 0; };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament lifecycle processing");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "process_match_deadlines");
  const { id } = await context.params;
  const tournamentRef = db.collection("tournaments").doc(id);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id, ...tournamentSnap.data() } as TournamentFoundation & Record<string, unknown>;
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament lifecycle permission is required.", 403, permission, "TOURNAMENT_LIFECYCLE_PERMISSION_REQUIRED");
  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "process_match_deadlines") {
    const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
    const [roundsSnap, matchesSnap, submissionsSnap, competitorsSnap] = await Promise.all([
      db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
      db.collection("tournamentMatches").where("tournamentId", "==", id).limit(500).get(),
      db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(1000).get(),
      db.collection(competitorCollection).where("tournamentId", "==", id).limit(1000).get()
    ]);
    const competitorRecipients = new Map(competitorsSnap.docs.map((competitor) => {
      const data = competitor.data();
      const recipients = tournament.participationMode === "team"
        ? Array.isArray(data.memberUserIds) ? data.memberUserIds.map(String).filter(Boolean) : []
        : [String(data.userId ?? "")].filter(Boolean);
      return [competitor.id, recipients] as const;
    }));
    const deadlines = new Map(roundsSnap.docs.map((round) => [round.id, dateMs(round.data().endsAt)]));
    const submissions = submissionsSnap.docs.map((submission) => ({
      id: submission.id,
      ...submission.data()
    } as { id: string; matchId?: string | null; participantId?: string; status?: string }));
    const matches = matchesSnap.docs.map((match) => ({ id: match.id, ...match.data() } as TournamentMatchFoundation & Record<string, unknown>)).filter((match) => {
      const deadline = dateMs(match.submissionDeadlineAt) || deadlines.get(match.roundId) || 0;
      return match.status !== "bye" && Boolean(match.participantAId && match.participantBId) && !["confirmed", "forfeit"].includes(match.status) && deadline > 0 && deadline <= now.getTime();
    });
    const outcomes: Array<{ matchId: string; action: string }> = [];
    for (const match of matches) {
      const valid = submissions.filter((submission) => submission.matchId === match.id && ["submitted", "approved", "pending_moderation", "under_review"].includes(String(submission.status)));
      const aSubmitted = valid.some((submission) => submission.participantId === match.participantAId);
      const bSubmitted = valid.some((submission) => submission.participantId === match.participantBId);
      if (valid.some((submission) => ["pending_moderation", "under_review"].includes(String(submission.status))) && !(aSubmitted && bSubmitted)) {
        await db.collection("tournamentMatches").doc(match.id).set({ status: "admin_review", noSubmissionReviewReason: "platform_moderation_pending", updatedAt: nowIso }, { merge: true });
        outcomes.push({ matchId: match.id, action: "admin_review" });
        continue;
      }
      const resolution = resolveTournamentNoSubmission({ participantASubmitted: aSubmitted, participantBSubmitted: bSubmitted, extensionAlreadyUsed: match.noSubmissionExtensionUsed === true });
      if (resolution.action === "extend") {
        const extensionEndsAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
        await db.runTransaction(async (transaction) => {
          const ref = db.collection("tournamentMatches").doc(match.id);
          const current = await transaction.get(ref);
          if (current.data()?.noSubmissionExtensionUsed === true || ["confirmed", "forfeit"].includes(String(current.data()?.status ?? ""))) return;
          transaction.set(ref, { noSubmissionExtensionUsed: true, submissionDeadlineAt: extensionEndsAt, status: "awaiting_submission", updatedAt: nowIso }, { merge: true });
          transaction.create(db.collection("tournamentAuditEvents").doc(`${match.id}_no_submission_extension`), { id: `${match.id}_no_submission_extension`, tournamentId: id, actorId: user.uid, action: "no_submission_extension", createdAt: nowIso, metadata: { matchId: match.id, extensionHours: 12 } });
        });
        const recipientIds = [...new Set([match.participantAId, match.participantBId].flatMap((competitorId) => competitorRecipients.get(String(competitorId ?? "")) ?? []))];
        await Promise.allSettled(recipientIds.map((recipientId) => createNotification(db, { userId: recipientId, type: "tournament_submission_extension", title: "Tournament submission extended", body: "Both competitors received one 12-hour submission extension.", entityType: "tournament_match", entityId: match.id, actionUrl: `/tournaments/${id}/matches/${match.id}`, idempotencyKey: `${match.id}_no_submission_extension_${recipientId}` })));
        outcomes.push({ matchId: match.id, action: "extension" });
      } else if (resolution.action === "forfeit") {
        const winnerId = resolution.winnerSlot === "A" ? match.participantAId : match.participantBId;
        const loserId = resolution.winnerSlot === "A" ? match.participantBId : match.participantAId;
        const nextSnap = match.nextMatchId ? await db.collection("tournamentMatches").doc(match.nextMatchId).get() : null;
        const advancement = advanceWinner({ match: { ...match, winnerParticipantId: winnerId, loserParticipantId: loserId }, existingNextMatch: nextSnap?.exists ? { id: nextSnap.id, ...nextSnap.data() } as TournamentMatchFoundation : null });
        await db.runTransaction(async (transaction) => {
          const ref = db.collection("tournamentMatches").doc(match.id);
          const current = await transaction.get(ref);
          if (["confirmed", "forfeit"].includes(String(current.data()?.status ?? ""))) return;
          transaction.set(ref, { status: "forfeit", resultStatus: "confirmed", winnerParticipantId: winnerId, loserParticipantId: loserId, forfeitReason: "submission_deadline_missed", forfeitedAt: nowIso, confirmedAt: nowIso, confirmedBy: "system_deadline_processor", updatedAt: nowIso }, { merge: true });
          if (advancement.nextMatch) transaction.set(db.collection("tournamentMatches").doc(advancement.nextMatch.id), advancement.nextMatch, { merge: true });
          transaction.create(db.collection("tournamentAuditEvents").doc(`${match.id}_submission_forfeit`), { id: `${match.id}_submission_forfeit`, tournamentId: id, actorId: user.uid, action: "submission_forfeit", createdAt: nowIso, metadata: { matchId: match.id, winnerId, loserId } });
        });
        outcomes.push({ matchId: match.id, action: "forfeit" });
      } else if (resolution.action === "admin_review") {
        await db.collection("tournamentMatches").doc(match.id).set({ status: "admin_review", noSubmissionReviewReason: "both_absent_after_extension", updatedAt: nowIso }, { merge: true });
        outcomes.push({ matchId: match.id, action: "admin_review" });
      }
    }
    return ok({ processed: outcomes.length, outcomes, clientTimerUsed: false }, "Tournament match deadlines processed server-side.");
  }

  if (action === "process_check_in_close") {
    if (!tournament.requiresCheckIn) return ok({ released: 0, offers: 0, status: "not_required" }, "Tournament check-in is not required.");
    if (!tournament.checkInClosesAt || dateMs(tournament.checkInClosesAt) > now.getTime()) return fail("Check-in is still open.", 409, undefined, "TOURNAMENT_CHECK_IN_OPEN");
    const competitorsCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
    const [competitorsSnap, waitlistSnap] = await Promise.all([db.collection(competitorsCollection).where("tournamentId", "==", id).limit(1000).get(), db.collection("tournamentWaitlist").where("tournamentId", "==", id).limit(1000).get()]);
    const noShows = competitorsSnap.docs.filter((competitor) => { const data = competitor.data(); const checkedIn = tournament.participationMode === "team" ? data.status === "checked_in" : data.checkInStatus === "checked_in"; return !checkedIn && ["registered", "ready", "confirmed"].includes(String(data.status ?? "")); });
    const waiting = waitlistSnap.docs.filter((item) => item.data().status === "waiting").sort((left, right) => Number(left.data().position ?? left.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER) - Number(right.data().position ?? right.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER));
    const offerExpiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const offeredCandidates = waiting.slice(0, noShows.length);
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(tournamentRef);
      if (current.data()?.noShowResolutionStatus === "completed") return;
      noShows.forEach((competitor) => transaction.set(competitor.ref, { status: "no_show", noShowAt: nowIso, updatedAt: nowIso }, { merge: true }));
      offeredCandidates.forEach((candidate, index) => { const offerRef = db.collection("tournamentWaitlistOffers").doc(`${id}_${candidate.id}_no_show_${index + 1}`); transaction.set(candidate.ref, { status: "invited", activeOfferId: offerRef.id, updatedAt: nowIso }, { merge: true }); transaction.create(offerRef, { id: offerRef.id, tournamentId: id, waitlistId: candidate.id, userId: candidate.data().userId ?? null, teamId: candidate.data().teamId ?? null, status: "pending", offeredAt: nowIso, offerExpiresAt, createdAt: nowIso, updatedAt: nowIso }); });
      transaction.set(tournamentRef, { noShowResolutionStatus: noShows.length && waiting.length ? "waitlist_offers_pending" : "completed", noShowsResolvedAt: nowIso, waitlistResolutionClosesAt: noShows.length && waiting.length ? offerExpiresAt : nowIso, updatedAt: nowIso }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${id}_check_in_close_processed`), { id: `${id}_check_in_close_processed`, tournamentId: id, actorId: user.uid, action: "check_in_close_processed", createdAt: nowIso, metadata: { noShowCount: noShows.length, offerCount: Math.min(noShows.length, waiting.length) } });
    });
    await Promise.allSettled(offeredCandidates.map(async (candidate) => {
      const data = candidate.data();
      let recipientIds = [String(data.userId ?? "")].filter(Boolean);
      if (!recipientIds.length && data.teamId) {
        const teamSnap = await db.collection("tournamentTeams").doc(String(data.teamId)).get();
        recipientIds = Array.isArray(teamSnap.data()?.memberUserIds) ? teamSnap.data()!.memberUserIds.map(String).filter(Boolean) : [];
      }
      await Promise.allSettled(recipientIds.map((recipientId) => createNotification(db, { userId: recipientId, type: "tournament_waitlist_offer", title: "Tournament place available", body: "A released tournament place is available for a limited time.", entityType: "tournament", entityId: id, actionUrl: `/tournaments/${id}/me`, idempotencyKey: `${id}_${candidate.id}_no_show_offer_${recipientId}` })));
    }));
    return ok({ released: noShows.length, offers: Math.min(noShows.length, waiting.length), offerExpiresAt, refundProviderCalled: false }, "Check-in no-shows and waitlist offers processed.");
  }

  if (action === "process_waitlist_offers") {
    const [offersSnap, waitlistSnap] = await Promise.all([
      db.collection("tournamentWaitlistOffers").where("tournamentId", "==", id).limit(1000).get(),
      db.collection("tournamentWaitlist").where("tournamentId", "==", id).limit(1000).get()
    ]);
    const expiredOffers = offersSnap.docs.filter((offer) => offer.data().status === "pending" && dateMs(offer.data().offerExpiresAt) <= now.getTime());
    if (!expiredOffers.length) return ok({ expired: 0, replacementOffers: 0, status: tournament.noShowResolutionStatus ?? "not_pending" }, "No expired waitlist offers require processing.");
    const waiting = waitlistSnap.docs.filter((item) => item.data().status === "waiting").sort((left, right) => Number(left.data().position ?? left.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER) - Number(right.data().position ?? right.data().waitlistPosition ?? Number.MAX_SAFE_INTEGER));
    const replacements = waiting.slice(0, expiredOffers.length);
    const replacementExpiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    await db.runTransaction(async (transaction) => {
      const currentTournament = await transaction.get(tournamentRef);
      if (currentTournament.data()?.noShowResolutionStatus === "completed") return;
      expiredOffers.forEach((offer) => {
        transaction.set(offer.ref, { status: "expired", expiredAt: nowIso, updatedAt: nowIso }, { merge: true });
        const waitlistId = String(offer.data().waitlistId ?? "");
        if (waitlistId) transaction.set(db.collection("tournamentWaitlist").doc(waitlistId), { status: "offer_expired", activeOfferId: null, updatedAt: nowIso }, { merge: true });
      });
      replacements.forEach((candidate, index) => {
        const sourceOffer = expiredOffers[index];
        const offerRef = db.collection("tournamentWaitlistOffers").doc(`${id}_${candidate.id}_replacement_${sourceOffer.id}`);
        transaction.set(candidate.ref, { status: "invited", activeOfferId: offerRef.id, updatedAt: nowIso }, { merge: true });
        transaction.create(offerRef, { id: offerRef.id, tournamentId: id, waitlistId: candidate.id, userId: candidate.data().userId ?? null, teamId: candidate.data().teamId ?? null, replacesOfferId: sourceOffer.id, status: "pending", offeredAt: nowIso, offerExpiresAt: replacementExpiresAt, createdAt: nowIso, updatedAt: nowIso });
      });
      transaction.set(tournamentRef, { noShowResolutionStatus: replacements.length ? "waitlist_offers_pending" : "completed", waitlistResolutionClosesAt: replacements.length ? replacementExpiresAt : nowIso, updatedAt: nowIso }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${id}_waitlist_expiry_${nowIso}`), { id: `${id}_waitlist_expiry_${nowIso}`, tournamentId: id, actorId: user.uid, action: "waitlist_offers_expired", createdAt: nowIso, metadata: { expiredCount: expiredOffers.length, replacementOfferCount: replacements.length } });
    });
    return ok({ expired: expiredOffers.length, replacementOffers: replacements.length, offerExpiresAt: replacements.length ? replacementExpiresAt : null, refundProviderCalled: false }, "Expired waitlist offers processed server-side.");
  }
  return fail("Choose a valid Tournament lifecycle action.", 400, undefined, "TOURNAMENT_LIFECYCLE_ACTION_INVALID");
}
