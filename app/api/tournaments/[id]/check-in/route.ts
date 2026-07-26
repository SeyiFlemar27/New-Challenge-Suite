import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament check-in");
  const { id } = await context.params;
  const participantRef = db.collection("tournamentParticipants").doc(`${id}_${user.uid}`);
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) return fail("Tournament participant record is required.", 403, undefined, "TOURNAMENT_PARTICIPANT_REQUIRED");
  const now = new Date().toISOString();
  await participantRef.set({ checkInStatus: "checked_in", status: "checked_in", checkedInAt: now, updatedAt: now }, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${id}_${user.uid}_checked_in`).set({ id: `${id}_${user.uid}_checked_in`, tournamentId: id, actorId: user.uid, action: "participant_checked_in", createdAt: now });
  return ok({ checkInStatus: "checked_in" }, "Tournament check-in confirmed.");
}
