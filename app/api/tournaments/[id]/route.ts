import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { assertTournamentTransition } from "@/lib/server/tournament-lifecycle";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import type { TournamentFoundation, TournamentStatus } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament detail");
  const { id } = await context.params;
  const snap = await db.collection("tournaments").doc(id).get();
  if (!snap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  return ok({ tournament: { id: snap.id, ...snap.data(), bracketExecutionEnabled: false, payoutExecutionEnabled: false } }, "Tournament loaded.");
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
  const update = { ...body, updatedAt: new Date().toISOString(), bracketExecutionEnabled: false, paymentActivationEnabled: false, payoutExecutionEnabled: false };
  await ref.set(update, { merge: true });
  return ok({ tournament: { ...tournament, ...update } }, "Tournament foundation updated. No bracket, participants, payments, winners, or payouts were created.");
}
