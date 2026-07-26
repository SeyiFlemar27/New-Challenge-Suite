import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { advanceWinner, finalPlacements, resolveMatchResult } from "@/lib/server/tournament-operations";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import type { TournamentMatchFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament result confirmation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const matchId = String(body.matchId ?? "");
  const [tournamentSnap, matchSnap] = await Promise.all([db.collection("tournaments").doc(id).get(), db.collection("tournamentMatches").doc(matchId).get()]);
  if (!tournamentSnap.exists || !matchSnap.exists) return fail("Tournament match is required.", 404, undefined, "TOURNAMENT_MATCH_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() };
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament result permission is required.", 403, permission, "TOURNAMENT_RESULT_PERMISSION_REQUIRED");
  const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
  const result = resolveMatchResult({ match, winnerParticipantId: String(body.winnerParticipantId ?? ""), loserParticipantId: String(body.loserParticipantId ?? ""), fraudFlag: Boolean(body.fraudFlag), moderationIssue: Boolean(body.moderationIssue), unresolvedTie: Boolean(body.unresolvedTie), overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : "", actor: { uid: user.uid, isAdmin: user.isAdmin, role: user.role } });
  if (!result.confirmed) return fail("Match result requires review before advancement.", 409, result, result.code);
  const nextMatchSnap = match.nextMatchId ? await db.collection("tournamentMatches").doc(match.nextMatchId).get() : null;
  const nextMatch = nextMatchSnap?.exists ? { id: nextMatchSnap.id, ...nextMatchSnap.data() } as TournamentMatchFoundation : null;
  const advancement = advanceWinner({ match: { ...match, winnerParticipantId: String(body.winnerParticipantId), loserParticipantId: String(body.loserParticipantId) }, existingNextMatch: nextMatch });
  await db.runTransaction(async (transaction) => {
    transaction.set(db.collection("tournamentMatches").doc(match.id), { winnerParticipantId: String(body.winnerParticipantId), loserParticipantId: String(body.loserParticipantId), resultStatus: result.status, status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: user.uid }, { merge: true });
    if (advancement.nextMatch) transaction.set(db.collection("tournamentMatches").doc(advancement.nextMatch.id), advancement.nextMatch, { merge: true });
    transaction.set(db.collection("tournamentAuditEvents").doc(`${match.id}_result_confirmed`), { id: `${match.id}_result_confirmed`, tournamentId: id, actorId: user.uid, action: body.overrideReason ? "result_overridden" : "result_confirmed", reason: String(body.overrideReason ?? ""), createdAt: new Date().toISOString(), metadata: { matchId: match.id, advancement: advancement.code } });
    if (!match.nextMatchId) {
      const placementRows = finalPlacements({ finalMatch: { ...match, winnerParticipantId: String(body.winnerParticipantId), loserParticipantId: String(body.loserParticipantId) }, bronzeMatch: null });
      placementRows.forEach((placement) => transaction.set(db.collection("tournamentPlacements").doc(`${id}_${placement.placement}`), { ...placement, id: `${id}_${placement.placement}`, tournamentId: id, userId: null, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true }));
    }
  });
  return ok({ result, advancement }, "Tournament result confirmed server-side. Payout remains admin and ledger-gated.");
}
