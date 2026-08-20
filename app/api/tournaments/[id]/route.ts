import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { assertTournamentTransition } from "@/lib/server/tournament-lifecycle";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
import { getTournamentBundle } from "@/lib/server/tournament-public";
import type { TournamentFoundation, TournamentStatus } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await getTournamentBundle(id);
  if (!bundle.available) return ok({ tournament: bundle.tournament, participants: [], rounds: [], matches: [], announcements: [], sponsors: [] }, bundle.message);
  if (!bundle.tournament) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  return ok({
    tournament: { ...bundle.tournament, bracketExecutionEnabled: true, payoutExecutionEnabled: false },
    participants: bundle.participants.slice(0, 100),
    rounds: bundle.rounds.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0)).slice(0, 20),
    matches: bundle.matches.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0) || Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0)).slice(0, 100),
    announcements: bundle.announcements.slice(0, 20),
    sponsors: bundle.sponsors.slice(0, 10)
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
  if (body.status && body.status !== tournament.status) {
    const transition = assertTournamentTransition(String(tournament.status ?? "draft") as TournamentStatus, String(body.status) as TournamentStatus);
    if (!transition.valid) return fail(transition.message, 409, transition, transition.code);
  }
  const validation = validateTournamentFoundation({ ...tournament, ...body }, { publish: body.status === "scheduled" || body.status === "pending_review" });
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  const merged = { ...tournament, ...body };
  const readiness = evaluateTournamentReadiness(merged);
  if (body.status === "pending_review" && !readiness.ready) return fail("Tournament details need attention before review.", 422, { fieldErrors: readiness.errors }, "TOURNAMENT_NOT_READY");
  const now = new Date().toISOString();
  const transitionToReview = tournament.status !== "pending_review" && body.status === "pending_review";
  const update = { ...body, ...(transitionToReview ? { submittedAt: now } : {}), readiness, updatedAt: now, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false };
  const batch = db.batch();
  batch.set(ref, update, { merge: true });
  if (transitionToReview) {
    batch.set(db.collection("tournamentReviewRequests").doc(`${id}_initial`), { id: `${id}_initial`, tournamentId: id, hostId: user.uid, status: "pending_review", revision: 1, createdAt: now, updatedAt: now });
    batch.set(db.collection("tournamentAuditEvents").doc(`${id}_submitted_initial`), { id: `${id}_submitted_initial`, tournamentId: id, actorId: user.uid, action: "submitted_for_review", createdAt: now, metadata: { status: "pending_review" } });
  }
  await batch.commit();
  return ok({ tournament: { ...tournament, ...update } }, transitionToReview ? "Tournament submitted for admin review." : "Tournament foundation updated. No bracket, participants, payments, winners, or payouts were created.");
}
