import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { validateTournamentSubmission } from "@/lib/server/tournament-operations";
import { tournamentSubmissionMediaPath } from "@/lib/media-upload-paths";
import { validateOwnedStorageMedia } from "@/lib/server/media-storage-validation";
import { createHash } from "node:crypto";
import { verifyTournamentSubmissionMedia } from "@/lib/server/tournament-submission-media";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";
import type { TournamentFoundation, TournamentMatchFoundation, TournamentParticipantFoundation, TournamentRoundFoundation, TournamentSubmissionStatus } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament submissions");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const matchId = String(body.matchId ?? "");
  if (!matchId) return fail("Tournament match is required.", 400, undefined, "TOURNAMENT_MATCH_REQUIRED");
  const [tournamentSnap, participantSnap, membershipSnap, roundSnap] = await Promise.all([
    db.collection("tournaments").doc(id).get(),
    db.collection("tournamentParticipants").doc(`${id}_${user.uid}`).get(),
    db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`).get(),
    db.collection("tournamentRounds").doc(String(body.roundId ?? "")).get()
  ]);
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  if (!roundSnap.exists) return fail("Tournament round is required.", 400, undefined, "TOURNAMENT_ROUND_REQUIRED");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const membership = membershipSnap.exists ? membershipSnap.data() ?? {} : null;
  if (tournament.participationMode === "team" && (!membership || membership.role !== "captain" || membership.status !== "active")) return fail("Only the active Team Captain can submit the team's round entry.", 403, undefined, "TEAM_CAPTAIN_SUBMISSION_REQUIRED");
  if (tournament.participationMode !== "team" && !participantSnap.exists) return fail("Tournament participant record is required.", 403, undefined, "TOURNAMENT_PARTICIPANT_REQUIRED");
  const participant = participantSnap.exists ? { id: participantSnap.id, ...participantSnap.data() } as TournamentParticipantFoundation : { id: String(membership?.teamId), tournamentId: id, userId: user.uid, teamId: String(membership?.teamId), status: "active", checkInStatus: "checked_in", seed: null, createdAt: "", updatedAt: "" } as TournamentParticipantFoundation;
  if (!["registered", "checked_in", "active"].includes(participant.status)) return fail("Only active tournament competitors can submit.", 403, { status: participant.status }, "TOURNAMENT_PARTICIPANT_NOT_ACTIVE");
  const ref = db.collection("tournamentSubmissions").doc(`${id}_${matchId}_${participant.id}`);
  const [matchSnap, teamSnap, existingSnap] = await Promise.all([
    db.collection("tournamentMatches").doc(matchId).get(),
    tournament.participationMode === "team" ? db.collection("tournamentTeams").doc(participant.id).get() : null,
    ref.get()
  ]);
  if (!matchSnap.exists) return fail("Tournament match is required.", 404, undefined, "TOURNAMENT_MATCH_NOT_FOUND");
  const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
  if (match.tournamentId !== id || match.roundId !== roundSnap.id || ![match.participantAId, match.participantBId].includes(participant.id)) return fail("This competitor is not assigned to the selected tournament match.", 403, undefined, "TOURNAMENT_MATCH_ASSIGNMENT_REQUIRED");
  const versionThree = Number(tournament.configVersion ?? 1) >= 3;
  if (versionThree && match.status !== "submissions_open") return fail("This match is not accepting submissions in its current server-controlled phase.", 409, undefined, "TOURNAMENT_SUBMISSIONS_NOT_OPEN");
  if (tournament.participationMode === "team" && (!teamSnap?.exists || !["checked_in", "active"].includes(String(teamSnap.data()?.status ?? "")))) return fail("The tournament Team must be checked in before submitting.", 409, undefined, "TOURNAMENT_TEAM_CHECK_IN_REQUIRED");
  const mediaType = String(body.mediaType ?? "");
  const mediaFolder = mediaType === "image" ? "images" : mediaType === "video" ? "videos" : null;
  if (!mediaFolder) return fail("Tournament submissions support image or video media.", 400, undefined, "MEDIA_TYPE_UNSUPPORTED");
  const mediaPrefix = `${tournamentSubmissionMediaPath(id, roundSnap.id, matchId, participant.id, mediaFolder)}/`;
  const media = validateOwnedStorageMedia({ url: String(body.mediaUrl ?? ""), path: String(body.mediaPath ?? ""), prefixes: [mediaPrefix] });
  if (!media.valid) return fail(media.message, 400, undefined, media.code);
  const roundData = roundSnap.data() ?? {};
  const validationRound = versionThree
    ? { id: roundSnap.id, ...roundData, startsAt: match.submissionsOpenedAt ?? null, endsAt: match.submissionDeadlineAt ?? null }
    : { id: roundSnap.id, ...roundData };
  const validation = validateTournamentSubmission({ tournament, round: validationRound as TournamentRoundFoundation, mediaUrl: String(body.mediaUrl ?? ""), mediaPath: String(body.mediaPath ?? ""), mediaType: String(body.mediaType ?? ""), replacementAllowed: Boolean((tournament.voting as Record<string, unknown>)?.submissionReplacementAllowed), existingStatus: existingSnap.exists ? String(existingSnap.data()?.status ?? "") as TournamentSubmissionStatus : null });
  if (!validation.valid) return fail(validation.message, 400, validation, validation.code);
  let verifiedMedia: Awaited<ReturnType<typeof verifyTournamentSubmissionMedia>> | null = null;
  if (tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) {
    try { verifiedMedia = await verifyTournamentSubmissionMedia({ tournamentId: id, submissionId: ref.id, path: String(body.mediaPath), mediaType: mediaType as "image" | "video" }); }
    catch { return fail("The uploaded match media could not be verified. Upload an accepted file and retry.", 422, undefined, "SUBMISSION_MEDIA_VERIFICATION_FAILED"); }
  }
  const contentFingerprint = createHash("sha256").update(JSON.stringify({ mediaUrl: String(body.mediaUrl), mediaPath: String(body.mediaPath), mediaType, caption: String(body.caption ?? "").slice(0, 400) })).digest("hex");
  let savedSubmission: Record<string, unknown> | null = null;
  let idempotentReplay = false;
  try {
    await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection("tournaments").doc(id);
      const matchRef = db.collection("tournamentMatches").doc(matchId);
      const currentParticipantRef = db.collection("tournamentParticipants").doc(`${id}_${user.uid}`);
      const currentMembershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`);
      const currentTeamRef = tournament.participationMode === "team" ? db.collection("tournamentTeams").doc(participant.id) : null;
      const [currentTournamentSnap, currentMatchSnap, currentRoundSnap, currentSubmissionSnap, currentParticipantSnap, currentMembershipSnap, currentTeamSnap] = await Promise.all([
        transaction.get(tournamentRef), transaction.get(matchRef), transaction.get(db.collection("tournamentRounds").doc(roundSnap.id)), transaction.get(ref),
        transaction.get(currentParticipantRef), transaction.get(currentMembershipRef), currentTeamRef ? transaction.get(currentTeamRef) : Promise.resolve(null)
      ]);
      if (!currentTournamentSnap.exists || !currentMatchSnap.exists || !currentRoundSnap.exists) throw Object.assign(new Error("TOURNAMENT_MATCH_NOT_FOUND"), { code: "TOURNAMENT_MATCH_NOT_FOUND" });
      const currentTournament = { id: currentTournamentSnap.id, ...currentTournamentSnap.data() } as TournamentFoundation;
      const currentMatch = { id: currentMatchSnap.id, ...currentMatchSnap.data() } as TournamentMatchFoundation;
      const currentMembership = currentMembershipSnap.exists ? currentMembershipSnap.data() ?? {} : null;
      const currentParticipant = currentParticipantSnap.exists ? { id: currentParticipantSnap.id, ...currentParticipantSnap.data() } as TournamentParticipantFoundation : null;
      const currentParticipantId = currentTournament.participationMode === "team" ? String(currentMembership?.teamId ?? "") : String(currentParticipant?.id ?? "");
      if (currentTournament.participationMode !== tournament.participationMode || currentMatch.tournamentId !== id || currentMatch.roundId !== currentRoundSnap.id || ![currentMatch.participantAId, currentMatch.participantBId].includes(currentParticipantId)) throw Object.assign(new Error("TOURNAMENT_MATCH_ASSIGNMENT_REQUIRED"), { code: "TOURNAMENT_MATCH_ASSIGNMENT_REQUIRED" });
      if (currentTournament.participationMode === "team") {
        if (!currentMembership || currentMembership.status !== "active" || currentMembership.role !== "captain" || currentParticipantId !== participant.id || !currentTeamSnap?.exists || !["checked_in", "active"].includes(String(currentTeamSnap.data()?.status ?? ""))) throw Object.assign(new Error("TEAM_CAPTAIN_SUBMISSION_REQUIRED"), { code: "TEAM_CAPTAIN_SUBMISSION_REQUIRED" });
      } else if (!currentParticipant || currentParticipant.tournamentId !== id || !["registered", "checked_in", "active"].includes(currentParticipant.status)) {
        throw Object.assign(new Error("TOURNAMENT_PARTICIPANT_NOT_ACTIVE"), { code: "TOURNAMENT_PARTICIPANT_NOT_ACTIVE" });
      }
      const pendingBronze = Number(currentTournament.configVersion ?? 1) >= 3 && currentTournament.status === "under_review" && currentMatch.bracket === "bronze" && !currentTournamentSnap.data()?.settlementId;
      if (Number(currentTournament.configVersion ?? 1) >= 3 && (currentMatch.status !== "submissions_open" || (!pendingBronze && !["active", "round_active"].includes(currentTournament.status)))) throw Object.assign(new Error("TOURNAMENT_SUBMISSIONS_NOT_OPEN"), { code: "TOURNAMENT_SUBMISSIONS_NOT_OPEN" });
      const prior = currentSubmissionSnap.exists ? currentSubmissionSnap.data() ?? {} : null;
      const currentRoundData = currentRoundSnap.data() ?? {};
      const currentValidationRound = Number(currentTournament.configVersion ?? 1) >= 3
        ? { id: currentRoundSnap.id, ...currentRoundData, startsAt: currentMatch.submissionsOpenedAt ?? null, endsAt: currentMatch.submissionDeadlineAt ?? null }
        : { id: currentRoundSnap.id, ...currentRoundData };
      const currentValidation = validateTournamentSubmission({ tournament: currentTournament, round: currentValidationRound as TournamentRoundFoundation, mediaUrl: String(body.mediaUrl ?? ""), mediaPath: String(body.mediaPath ?? ""), mediaType, replacementAllowed: Boolean((currentTournament.voting as Record<string, unknown>)?.submissionReplacementAllowed), existingStatus: prior ? String(prior.status ?? "") as TournamentSubmissionStatus : null, now: new Date() });
      if (!currentValidation.valid) throw Object.assign(new Error(currentValidation.code), { code: currentValidation.code });
      if (prior?.contentFingerprint === contentFingerprint && prior.status === "submitted") {
        savedSubmission = { id: ref.id, ...prior };
        idempotentReplay = true;
        return;
      }
      if (currentTournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) {
        if (!verifiedMedia) throw Object.assign(new Error("SUBMISSION_MEDIA_VERIFICATION_FAILED"), { code: "SUBMISSION_MEDIA_VERIFICATION_FAILED" });
        const expectedRevision = Number(body.expectedRevision ?? 0);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== Number(prior?.revision ?? 0)) throw Object.assign(new Error("SUBMISSION_REVISION_STALE"), { code: "SUBMISSION_REVISION_STALE" });
        const history = await transaction.get(db.collection("tournamentSubmissions").where("tournamentId", "==", id).where("participantId", "==", currentParticipantId));
        if (history.docs.some(document => document.id !== ref.id && document.data().mediaVerification?.sha256 === verifiedMedia?.sha256)) throw Object.assign(new Error("FRESH_MATCH_MEDIA_REQUIRED"), { code: "FRESH_MATCH_MEDIA_REQUIRED" });
      }
      const now = new Date().toISOString();
      const revision = Number(prior?.revision ?? 0) + 1;
      if (prior) {
        const revisionRef = db.collection("tournamentSubmissionRevisions").doc(`${ref.id}_revision_${revision - 1}`);
        transaction.create(revisionRef, { id: revisionRef.id, tournamentId: id, submissionId: ref.id, revision: revision - 1, snapshot: prior, preservedAt: now, preservedBy: user.uid });
      }
      const submission = { id: ref.id, tournamentId: id, roundId: currentRoundSnap.id, matchId, participantId: currentParticipantId, teamId: currentTournament.participationMode === "team" ? currentParticipantId : null, userId: user.uid, submittedByCaptain: currentTournament.participationMode === "team", status: "submitted", revision, contentFingerprint, mediaUrl: String(body.mediaUrl), mediaPath: String(body.mediaPath), mediaType, caption: String(body.caption ?? "").slice(0, 400), submittedAt: now, updatedAt: now };
      if (verifiedMedia) Object.assign(submission, { mediaVerification: verifiedMedia, mediaUrl: `/api/tournaments/${encodeURIComponent(id)}/submissions/${encodeURIComponent(ref.id)}/media?revision=${revision}` });
      transaction.set(ref, submission);
      const auditRef = db.collection("tournamentAuditEvents").doc(`${ref.id}_submitted_v${revision}`);
      transaction.set(auditRef, { id: auditRef.id, tournamentId: id, actorId: user.uid, action: prior ? "submission_replaced" : "submission_submitted", createdAt: now, metadata: { roundId: currentRoundSnap.id, matchId, participantId: currentParticipantId, revision } });
      savedSubmission = submission;
    });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "TOURNAMENT_SUBMISSION_FAILED";
    const status = ["TOURNAMENT_MATCH_NOT_FOUND"].includes(code) ? 404 : ["TEAM_CAPTAIN_SUBMISSION_REQUIRED", "TOURNAMENT_PARTICIPANT_NOT_ACTIVE", "TOURNAMENT_MATCH_ASSIGNMENT_REQUIRED"].includes(code) ? 403 : 409;
    const messages: Record<string, string> = { SUBMISSION_REVISION_STALE: "Your submission changed. Refresh before replacing it again.", FRESH_MATCH_MEDIA_REQUIRED: "Each match requires fresh media. Do not reuse an earlier match entry.", SUBMISSION_MEDIA_VERIFICATION_FAILED: "The media must be verified before this submission can be saved.", SUBMISSION_NOT_OPEN: "Submissions are not open yet.", SUBMISSION_DEADLINE_CLOSED: "The submission deadline has passed.", SUBMISSION_ALREADY_RECORDED: "An official submission has already been recorded for this match.", REPLACEMENT_NOT_ALLOWED: "Submission replacement is not allowed by Tournament rules.", TOURNAMENT_SUBMISSIONS_NOT_OPEN: "This match is not accepting submissions in its current phase." };
    return fail(messages[code] ?? "The Tournament submission could not be saved in its current state.", status, undefined, code);
  }
  const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
  await attemptTournamentNotifications(db, id);
  return ok({ submission: savedSubmission, idempotentReplay }, idempotentReplay ? "The existing Tournament submission was returned safely." : "Tournament submission saved after uploaded media and deadline validation.");
}
