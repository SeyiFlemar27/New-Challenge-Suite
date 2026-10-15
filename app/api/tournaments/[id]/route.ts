import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser, requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { assertTournamentTransition } from "@/lib/server/tournament-lifecycle";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
import { getTournamentBundle } from "@/lib/server/tournament-public";
import { publicTournamentParticipantIds, publicTournamentParticipantView, publicTournamentView } from "@/lib/server/tournament-public-policy";
import type { TournamentFoundation, TournamentStatus } from "@/lib/tournament-types";
import { verifyCreatorImage } from "@/lib/server/creator-image-verification";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const viewer = await getOptionalRequestUser(request);
  const bundle = await getTournamentBundle(id, viewer);
  if (!bundle.available && bundle.message === "Tournament not found or unavailable.") return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  if (!bundle.available) return ok({ tournament: bundle.tournament, participants: [], rounds: [], matches: [], announcements: [], sponsors: [] }, bundle.message);
  if (!bundle.tournament) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const publicIds = publicTournamentParticipantIds(bundle.participants);
  return ok({
    tournament: publicTournamentView(bundle.tournament),
    participants: bundle.participants.slice(0, 100).map((item) => publicTournamentParticipantView(item, publicIds.get(item.id) ?? "entrant")),
    rounds: bundle.rounds.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0)).slice(0, 20).map((round) => Object.fromEntries(Object.entries(round).filter(([key]) => ["id", "roundNumber", "bracket", "status", "startsAt", "endsAt", "votingOpensAt", "votingClosesAt"].includes(key)))),
    matches: bundle.matches.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0) || Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0)).slice(0, 100).map((match) => {
      const safe: Record<string, unknown> = Object.fromEntries(Object.entries(match).filter(([key]) => ["id", "roundId", "roundNumber", "matchNumber", "bracket", "status", "resultStatus", "openedAt", "submissionsOpenedAt", "submissionDeadlineAt", "votingOpenedAt", "votingClosesAt", "votingClosedAt", "dependencyHoldReason", "noSubmissionExtensionUsed", "doubleForfeitAt"].includes(key)));
      if (match.status === "confirmed" && match.resultStatus === "confirmed") {
        for (const field of ["verifiedVoteCountA", "verifiedVoteCountB"] as const) {
          const count = match[field];
          if (Number.isSafeInteger(count) && Number(count) >= 0) safe[field] = Number(count);
        }
      }
      for (const key of ["participantAId", "participantBId", "winnerParticipantId", "loserParticipantId"] as const) {
        const value = match[key];
        if (typeof value === "string") safe[key] = publicIds.get(value) ?? null;
      }
      return safe;
    }),
    announcements: bundle.announcements.slice(0, 20).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => ["id", "title", "body", "createdAt"].includes(key)))),
    sponsors: bundle.sponsors.slice(0, 10).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => ["id", "brandName", "logoUrl", "displayName"].includes(key))))
  }, "Tournament loaded.");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament update");
  const { id } = await context.params;
  const ref = db.collection("tournaments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id: snap.id, ...snap.data() } as TournamentFoundation;
  const permission = canEditTournament({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament);
  if (!permission.allowed) return fail("Tournament manager permission is required.", 403, permission, "TOURNAMENT_MANAGER_REQUIRED");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const immutableFields = ["id", "hostId", "creatorId", "createdAt", "ownershipType", "officialChallenge", "enterpriseOrganizationId", "configVersion"];
  if (immutableFields.some((field) => field in body && String(body[field] ?? "") !== String((tournament as unknown as Record<string, unknown>)[field] ?? ""))) return fail("Tournament identity and ownership fields cannot be changed after creation.", 409, undefined, "TOURNAMENT_IDENTITY_LOCKED");
  if (Number(tournament.configVersion ?? 1) >= 3) {
    const serverOwnedFields = ["participantCount", "timingLockedAt", "activationState", "activationVersion", "activationWindowEndsAt", "activationActivatedAt", "activationHoldReason", "registrationLockedAt", "seedsLockedAt", "bracketGeneratedAt", "bracketLockedAt", "currentRoundId", "currentRoundNumber", "winnerParticipantId", "officialPlacementsFinalizedAt", "officialPlacementsFinalizedBy", "settlementId", "settlementStatus", "settlementPlacementFingerprint", "creatorPlacementReviewFingerprint", "payoutExecutionEnabled", "paymentActivationEnabled", "bracketExecutionEnabled", "firstVotingOpenedAt", "tournamentVotingCutoffAt", "registrationRefundCutoffAt", "prizePool", "confirmedPrizePoolMinor", "winnerIds", "winnerUserIds"];
    if (serverOwnedFields.some((field) => field in body)) return fail("Tournament execution and financial state is server-managed.", 409, undefined, "TOURNAMENT_SERVER_STATE_REQUIRED");
    if (body.configVersion !== undefined && Number(body.configVersion) !== Number(tournament.configVersion)) return fail("Tournament configuration version cannot be changed.", 409, undefined, "TOURNAMENT_VERSION_LOCKED");
    if (tournament.timingLockedAt && ((body.submissionDurationHours !== undefined && Number(body.submissionDurationHours) !== Number(tournament.submissionDurationHours)) || (body.votingDurationHours !== undefined && Number(body.votingDurationHours) !== Number(tournament.votingDurationHours)))) return fail("Round timing is locked after the first confirmed entrant.", 409, undefined, "TOURNAMENT_TIMING_LOCKED");
    if (body.status !== undefined && body.status !== tournament.status && !(tournament.status === "draft" && body.status === "pending_review")) return fail("Tournament lifecycle state is controlled by review and server-side competition events.", 409, undefined, "TOURNAMENT_SERVER_TRANSITION_REQUIRED");
  }
  if (body.ownershipType !== undefined && body.ownershipType !== tournament.ownershipType) return fail("Tournament ownership cannot be changed after creation.", 409, undefined, "TOURNAMENT_OWNERSHIP_LOCKED");
  if (body.officialChallenge !== undefined && Boolean(body.officialChallenge) !== Boolean(tournament.officialChallenge)) return fail("Tournament ownership cannot be changed after creation.", 409, undefined, "TOURNAMENT_OWNERSHIP_LOCKED");
  if (body.status && body.status !== tournament.status) {
    const transition = assertTournamentTransition(String(tournament.status ?? "draft") as TournamentStatus, String(body.status) as TournamentStatus);
    if (!transition.valid) return fail(transition.message, 409, transition, transition.code);
  }
  const mediaFields = ["coverImageUrl", "coverImagePath", "trailerUrl", "trailerPath"];
  const validation = validateTournamentFoundation({ ...tournament, ...body }, { publish: body.status === "scheduled" || body.status === "pending_review", ownerId: String(tournament.hostId ?? user.uid), validateMedia: body.status === "pending_review" || mediaFields.some((field) => field in body) });
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  const merged = { ...tournament, ...body };
  const readiness = evaluateTournamentReadiness(merged);
  if (body.status === "pending_review" && !readiness.ready) return fail("Tournament details need attention before review.", 422, { fieldErrors: readiness.errors }, "TOURNAMENT_NOT_READY");
  const now = new Date().toISOString();
  const transitionToReview = tournament.status !== "pending_review" && body.status === "pending_review";
  let creatorMediaVerification = null;
  if (transitionToReview) {
    try { creatorMediaVerification = await verifyCreatorImage(String((merged as Record<string, unknown>).coverImagePath ?? merged.coverMedia?.path ?? ""), String(tournament.hostId ?? user.uid)); }
    catch { return fail("Upload a valid, owned creator image of 10 MB or smaller before Admin Review.", 422, undefined, "MEDIA_VERIFICATION_FAILED"); }
  }
  const update = { ...body, ...(transitionToReview ? { submittedAt: now } : {}), readiness, updatedAt: now, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false };
  const batch = db.batch();
  if (creatorMediaVerification) Object.assign(update, { creatorMediaVerification });
  batch.set(ref, update, { merge: true });
  if (transitionToReview) {
    batch.set(db.collection("tournamentReviewRequests").doc(`${id}_initial`), { id: `${id}_initial`, tournamentId: id, hostId: user.uid, status: "pending_review", revision: 1, createdAt: now, updatedAt: now });
    batch.set(db.collection("tournamentAuditEvents").doc(`${id}_submitted_initial`), { id: `${id}_submitted_initial`, tournamentId: id, actorId: user.uid, action: "submitted_for_review", createdAt: now, metadata: { status: "pending_review" } });
  }
  await batch.commit();
  return ok({ tournament: { ...tournament, ...update } }, transitionToReview ? "Tournament submitted for admin review." : "Tournament foundation updated. No bracket, participants, payments, winners, or payouts were created.");
}
