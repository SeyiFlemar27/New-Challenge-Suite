import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament waitlist");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "participant_manager"]);
  if (!permission.allowed) return fail("Participant manager permission is required.", 403, permission, "PARTICIPANT_MANAGER_REQUIRED");
  const targetUserId = String(body.userId ?? "");
  if (!targetUserId) return fail("Waitlist target user is required.", 400, undefined, "WAITLIST_USER_REQUIRED");
  const ref = db.collection("tournamentWaitlist").doc(`${id}_${targetUserId}_offer`);
  const offer = { id: ref.id, tournamentId: id, userId: targetUserId, status: "invited", offerExpiresAt: String(body.offerExpiresAt ?? "") || null, promotedBy: user.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await ref.set(offer, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${ref.id}_promoted`).set({ id: `${ref.id}_promoted`, tournamentId: id, actorId: user.uid, action: "waitlist_promoted", createdAt: offer.createdAt });
  return ok({ offer }, "Waitlist offer created for the next eligible participant. Eligibility is rechecked on acceptance.");
}
