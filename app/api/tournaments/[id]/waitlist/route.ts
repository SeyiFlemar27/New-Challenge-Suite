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
  const action = String(body.action ?? "promote");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as Record<string, unknown>;
  const now = new Date().toISOString();
  if (action === "accept_offer") {
    const offerId = String(body.offerId ?? "");
    const offerRef = db.collection("tournamentWaitlistOffers").doc(offerId);
    try {
      await db.runTransaction(async (transaction) => {
        const offerSnap = await transaction.get(offerRef);
        if (!offerSnap.exists || offerSnap.data()?.tournamentId !== id || offerSnap.data()?.status !== "pending") throw new Error("OFFER_NOT_PENDING");
        if (new Date(String(offerSnap.data()?.offerExpiresAt ?? "")).getTime() <= Date.now()) throw new Error("OFFER_EXPIRED");
        const teamId = String(offerSnap.data()?.teamId ?? "");
        if (teamId) {
          const teamRef = db.collection("tournamentTeams").doc(teamId);
          const teamSnap = await transaction.get(teamRef);
          if (!teamSnap.exists || teamSnap.data()?.captainUserId !== user.uid || teamSnap.data()?.status !== "ready" || (tournament.entryType !== "free" && teamSnap.data()?.paymentStatus !== "confirmed")) throw new Error("TEAM_INELIGIBLE");
          transaction.set(teamRef, { status: "checked_in", rosterLockedAt: now, promotedFromWaitlistAt: now, updatedAt: now }, { merge: true });
        } else {
          if (offerSnap.data()?.userId !== user.uid) throw new Error("OFFER_OWNER_REQUIRED");
          const participantRef = db.collection("tournamentParticipants").doc(`${id}_${user.uid}`);
          const participantSnap = await transaction.get(participantRef);
          if (!participantSnap.exists || (tournament.entryType !== "free" && participantSnap.data()?.paymentStatus !== "confirmed")) throw new Error("PARTICIPANT_INELIGIBLE");
          transaction.set(participantRef, { status: "checked_in", checkInStatus: "checked_in", promotedFromWaitlistAt: now, updatedAt: now }, { merge: true });
        }
        transaction.set(offerRef, { status: "accepted", acceptedAt: now, acceptedBy: user.uid, updatedAt: now }, { merge: true });
        transaction.set(db.collection("tournamentWaitlist").doc(String(offerSnap.data()?.waitlistId ?? "")), { status: "promoted", promotedAt: now, updatedAt: now }, { merge: true });
        transaction.create(db.collection("tournamentAuditEvents").doc(`${offerId}_accepted`), { id: `${offerId}_accepted`, tournamentId: id, actorId: user.uid, action: "waitlist_offer_accepted", createdAt: now, metadata: { offerId } });
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      return fail(code === "OFFER_EXPIRED" ? "This waitlist offer has expired." : code === "OFFER_OWNER_REQUIRED" ? "This waitlist offer belongs to another account." : "This waitlist offer can no longer be accepted.", code === "OFFER_OWNER_REQUIRED" ? 403 : 409, undefined, code || "WAITLIST_OFFER_INVALID");
    }
    const remainingOffers = await db.collection("tournamentWaitlistOffers").where("tournamentId", "==", id).where("status", "==", "pending").limit(1).get();
    if (remainingOffers.empty) await db.collection("tournaments").doc(id).set({ noShowResolutionStatus: "completed", waitlistResolvedAt: now, updatedAt: now }, { merge: true });
    return ok({ offerId, status: "accepted" }, "Waitlist place accepted and confirmed.");
  }
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "participant_manager"]);
  if (!permission.allowed) return fail("Participant manager permission is required.", 403, permission, "PARTICIPANT_MANAGER_REQUIRED");
  const targetUserId = String(body.userId ?? "");
  if (!targetUserId) return fail("Waitlist target user is required.", 400, undefined, "WAITLIST_USER_REQUIRED");
  const ref = db.collection("tournamentWaitlist").doc(`${id}_${targetUserId}_offer`);
  const offer = { id: ref.id, tournamentId: id, userId: targetUserId, status: "invited", offerExpiresAt: String(body.offerExpiresAt ?? "") || null, promotedBy: user.uid, createdAt: now, updatedAt: now };
  await ref.set(offer, { merge: true });
  await db.collection("tournamentAuditEvents").doc(`${ref.id}_promoted`).set({ id: `${ref.id}_promoted`, tournamentId: id, actorId: user.uid, action: "waitlist_promoted", createdAt: offer.createdAt });
  return ok({ offer }, "Waitlist offer created for the next eligible participant. Eligibility is rechecked on acceptance.");
}
