import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { validateTournamentSubmission } from "@/lib/server/tournament-operations";
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
  if (tournament.participationMode === "team" && (!teamSnap?.exists || !["checked_in", "active"].includes(String(teamSnap.data()?.status ?? "")))) return fail("The tournament Team must be checked in before submitting.", 409, undefined, "TOURNAMENT_TEAM_CHECK_IN_REQUIRED");
  const validation = validateTournamentSubmission({ tournament, round: { id: roundSnap.id, ...roundSnap.data() } as TournamentRoundFoundation, mediaUrl: String(body.mediaUrl ?? ""), mediaPath: String(body.mediaPath ?? ""), mediaType: String(body.mediaType ?? ""), replacementAllowed: Boolean((tournament.voting as Record<string, unknown>)?.submissionReplacementAllowed), existingStatus: existingSnap.exists ? String(existingSnap.data()?.status ?? "") as TournamentSubmissionStatus : null });
  if (!validation.valid) return fail(validation.message, 400, validation, validation.code);
  const now = new Date().toISOString();
  const submission = { id: ref.id, tournamentId: id, roundId: roundSnap.id, matchId, participantId: participant.id, teamId: tournament.participationMode === "team" ? participant.id : null, userId: user.uid, submittedByCaptain: tournament.participationMode === "team", status: "submitted", mediaUrl: String(body.mediaUrl), mediaPath: String(body.mediaPath), mediaType: String(body.mediaType), caption: String(body.caption ?? "").slice(0, 400), submittedAt: now, updatedAt: now };
  await ref.set(submission, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${ref.id}_submitted`).set({ id: `${ref.id}_submitted`, tournamentId: id, actorId: user.uid, action: "submission_submitted", createdAt: now, metadata: { roundId: roundSnap.id, matchId: submission.matchId } });
  return ok({ submission }, "Tournament submission saved after uploaded media validation.");
}
