import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { generateSingleEliminationBracket, seedParticipants } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentMatchFoundation, TournamentParticipantFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament bracket generation");
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager"]);
  if (!permission.allowed) return fail("Tournament host or manager permission is required.", 403, permission, "TOURNAMENT_MANAGER_REQUIRED");
  if (tournament.status !== "registration_closed" && tournament.status !== "seeding") return fail("Bracket generation requires closed registration.", 409, { status: tournament.status }, "TOURNAMENT_REGISTRATION_MUST_CLOSE");
  const [participantsSnap, matchesSnap] = await Promise.all([
    db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(1000).get(),
    db.collection("tournamentMatches").where("tournamentId", "==", id).limit(1).get()
  ]);
  const participants = participantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentParticipantFoundation[];
  const seeded = seedParticipants(participants, tournament.seedingMethod === "random" ? "random" : "manual");
  const bracket = generateSingleEliminationBracket({ tournament, participants: seeded, existingMatches: matchesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentMatchFoundation[] });
  if (!bracket.created) return fail("Bracket could not be generated.", 409, bracket, bracket.code);
  await db.runTransaction(async (transaction) => {
    seeded.forEach((participant) => transaction.set(db.collection("tournamentParticipants").doc(participant.id), { seed: participant.seed, updatedAt: participant.updatedAt }, { merge: true }));
    bracket.rounds.forEach((round) => transaction.set(db.collection("tournamentRounds").doc(round.id), round));
    bracket.matches.forEach((match) => transaction.set(db.collection("tournamentMatches").doc(match.id), match));
    transaction.set(db.collection("tournaments").doc(id), { status: "ready", seedsLockedAt: new Date().toISOString(), bracketGeneratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    transaction.set(db.collection("tournamentAuditEvents").doc(`${id}_bracket_generated`), { id: `${id}_bracket_generated`, tournamentId: id, actorId: user.uid, action: "bracket_generated", createdAt: new Date().toISOString(), metadata: { expectedMatchCount: bracket.expectedMatchCount, seedingMethod: tournament.seedingMethod } });
  });
  return ok({ rounds: bracket.rounds, matches: bracket.matches, expectedMatchCount: bracket.expectedMatchCount }, "Tournament bracket generated server-side.");
}
