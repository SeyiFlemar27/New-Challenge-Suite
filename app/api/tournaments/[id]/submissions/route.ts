import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { validateTournamentSubmission } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentParticipantFoundation, TournamentRoundFoundation } from "@/lib/tournament-types";

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
  const [tournamentSnap, participantSnap, roundSnap] = await Promise.all([
    db.collection("tournaments").doc(id).get(),
    db.collection("tournamentParticipants").doc(`${id}_${user.uid}`).get(),
    db.collection("tournamentRounds").doc(String(body.roundId ?? "")).get()
  ]);
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  if (!participantSnap.exists) return fail("Tournament participant record is required.", 403, undefined, "TOURNAMENT_PARTICIPANT_REQUIRED");
  if (!roundSnap.exists) return fail("Tournament round is required.", 400, undefined, "TOURNAMENT_ROUND_REQUIRED");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const participant = { id: participantSnap.id, ...participantSnap.data() } as TournamentParticipantFoundation;
  if (!["registered", "checked_in", "active"].includes(participant.status)) return fail("Only active tournament participants can submit.", 403, { status: participant.status }, "TOURNAMENT_PARTICIPANT_NOT_ACTIVE");
  const validation = validateTournamentSubmission({ tournament, round: { id: roundSnap.id, ...roundSnap.data() } as TournamentRoundFoundation, mediaUrl: String(body.mediaUrl ?? ""), mediaPath: String(body.mediaPath ?? ""), mediaType: String(body.mediaType ?? ""), replacementAllowed: Boolean((tournament.voting as Record<string, unknown>)?.submissionReplacementAllowed) });
  if (!validation.valid) return fail(validation.message, 400, validation, validation.code);
  const ref = db.collection("tournamentSubmissions").doc(`${id}_${String(body.matchId ?? "round")}_${participant.id}`);
  const now = new Date().toISOString();
  const submission = { id: ref.id, tournamentId: id, roundId: roundSnap.id, matchId: String(body.matchId ?? "") || null, participantId: participant.id, userId: user.uid, status: "submitted", mediaUrl: String(body.mediaUrl), mediaPath: String(body.mediaPath), mediaType: String(body.mediaType), caption: String(body.caption ?? "").slice(0, 400), submittedAt: now, updatedAt: now };
  await ref.set(submission, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${ref.id}_submitted`).set({ id: `${ref.id}_submitted`, tournamentId: id, actorId: user.uid, action: "submission_submitted", createdAt: now, metadata: { roundId: roundSnap.id, matchId: submission.matchId } });
  return ok({ submission }, "Tournament submission saved after uploaded media validation.");
}
