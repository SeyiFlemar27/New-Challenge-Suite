import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adminTournamentActionFoundation } from "@/lib/server/tournament-operations";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament management actions");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").slice(0, 500);
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament management permission is required.", 403, permission, "TOURNAMENT_MANAGER_REQUIRED");
  const foundation = adminTournamentActionFoundation(action);
  if (!action) return fail("Tournament action is required.", 400, undefined, "TOURNAMENT_ACTION_REQUIRED");
  if (["schedule_change", "pause", "cancel", "resume", "participant_removed", "submission_rejected", "dispute_resolved"].includes(action) && reason.length < 5) return fail("A reason is required for sensitive tournament actions.", 400, foundation, "TOURNAMENT_ACTION_REASON_REQUIRED");
  const now = new Date().toISOString();
  await db.collection("tournamentAuditEvents").doc(`${id}_${action}_${now}`).set({ id: `${id}_${action}_${now}`, tournamentId: id, actorId: user.uid, action, reason, createdAt: now, metadata: { foundation } });
  return ok({ action, auditRequired: foundation.auditRequired, payoutProviderCalled: false, balanceOverwriteAllowed: false, rawVoteTotalEditable: false }, "Tournament management action recorded as an audited foundation event.");
}
