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
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = tournamentSnap.data() ?? {};
  const now = new Date().toISOString();
  if (tournament.checkInClosesAt && new Date(now) >= new Date(String(tournament.checkInClosesAt))) return fail("Tournament check-in has closed.", 409, undefined, "TOURNAMENT_CHECK_IN_CLOSED");
  if (tournament.participationMode === "team") {
    const membershipSnap = await db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`).get();
    if (!membershipSnap.exists || membershipSnap.data()?.role !== "captain" || membershipSnap.data()?.status !== "active") return fail("Only the active Team Captain can check in the team.", 403, undefined, "TEAM_CAPTAIN_REQUIRED");
    const teamRef = db.collection("tournamentTeams").doc(String(membershipSnap.data()?.teamId ?? ""));
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) return fail("Tournament team not found.", 404, undefined, "TOURNAMENT_TEAM_NOT_FOUND");
    const team = teamSnap.data() ?? {};
    const memberCount = Array.isArray(team.memberUserIds) ? team.memberUserIds.length : 0;
    const minimum = Number(tournament.teamConfig?.minimumSize ?? 1);
    const maximum = Number(tournament.teamConfig?.maximumSize ?? 20);
    if (memberCount < minimum || memberCount > maximum) return fail("Team roster does not meet the configured size requirements.", 422, { memberCount, minimum, maximum }, "TEAM_ROSTER_SIZE_INVALID");
    if (tournament.entryType !== "free" && team.paymentStatus !== "confirmed") return fail("Confirmed Captain payment is required before team check-in.", 422, undefined, "TEAM_PAYMENT_CONFIRMATION_REQUIRED");
    const checkIn = await db.runTransaction(async (transaction) => {
      const currentTeamSnap = await transaction.get(teamRef);
      if (!currentTeamSnap.exists) return { checkedIn: false, missing: true };
      if (currentTeamSnap.data()?.rosterLockedAt) return { checkedIn: true, idempotent: true };
      transaction.set(teamRef, { status: "checked_in", rosterLockedAt: now, checkedInAt: now, checkedInBy: user.uid, updatedAt: now }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${teamRef.id}_checked_in`), { id: `${teamRef.id}_checked_in`, tournamentId: id, actorId: user.uid, action: "team_checked_in_roster_locked", createdAt: now, metadata: { teamId: teamRef.id, memberCount } });
      return { checkedIn: true, idempotent: false };
    });
    if (checkIn.missing) return fail("Tournament team not found.", 404, undefined, "TOURNAMENT_TEAM_NOT_FOUND");
    return ok({ checkInStatus: "checked_in", teamId: teamRef.id, rosterLocked: true, idempotent: checkIn.idempotent }, checkIn.idempotent ? "Tournament team is already checked in." : "Tournament team checked in and roster locked.");
  }
  const participantRef = db.collection("tournamentParticipants").doc(`${id}_${user.uid}`);
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) return fail("Tournament participant record is required.", 403, undefined, "TOURNAMENT_PARTICIPANT_REQUIRED");
  await participantRef.set({ checkInStatus: "checked_in", status: "checked_in", checkedInAt: now, updatedAt: now }, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${id}_${user.uid}_checked_in`).set({ id: `${id}_${user.uid}_checked_in`, tournamentId: id, actorId: user.uid, action: "participant_checked_in", createdAt: now });
  return ok({ checkInStatus: "checked_in" }, "Tournament check-in confirmed.");
}
