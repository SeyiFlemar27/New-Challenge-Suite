import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { fail, readJson, serverUnavailable } from "@/lib/server/responses";
import { processTournamentLifecycleAction } from "@/lib/server/tournament-lifecycle-scheduler";
import { reconcileTournamentLifecycleAfterStateChange } from "@/lib/server/tournament-match-lifecycle-jobs";
import type { TournamentFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

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
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id, ...tournamentSnap.data() } as TournamentFoundation & Record<string, unknown>;
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament lifecycle permission is required.", 403, permission, "TOURNAMENT_LIFECYCLE_PERMISSION_REQUIRED");
  const result = await processTournamentLifecycleAction({ db, id, tournament, action, actorId: user.uid });
  if (action === "process_match_deadlines" && Number(tournament.configVersion ?? 1) >= 3) {
    try { await reconcileTournamentLifecycleAfterStateChange(db, id); }
    catch (error) { console.error("Tournament lifecycle job reconciliation failed", { tournamentId: id, code: error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code).slice(0, 80) : "RECONCILIATION_FAILED" }); }
  }
  return result;
}
