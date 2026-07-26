import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament invitations");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "participant_manager"]);
  if (!permission.allowed) return fail("Participant manager permission is required.", 403, permission, "PARTICIPANT_MANAGER_REQUIRED");
  const inviteeUserId = String(body.inviteeUserId ?? "");
  if (!inviteeUserId) return fail("Invite target must be a valid Challenge Suite user.", 400, undefined, "INVITEE_REQUIRED");
  const ref = db.collection("tournamentInvitations").doc(`${id}_${inviteeUserId}`);
  const invitation = { id: ref.id, tournamentId: id, inviteeUserId, emailHash: null, status: "pending", expiresAt: String(body.expiresAt ?? "") || null, createdBy: user.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await ref.set(invitation, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${ref.id}_invited`).set({ id: `${ref.id}_invited`, tournamentId: id, actorId: user.uid, action: "invitation_created", createdAt: invitation.createdAt });
  return ok({ invitation }, "Tournament invitation created. Acceptance must re-run eligibility and capacity checks.");
}
