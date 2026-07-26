import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canCreateTournament } from "@/lib/server/tournament-permissions";
import { tournamentDraftFromInput, tournamentSubdomainFoundation } from "@/lib/server/tournaments";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament listing");
  const snap = await db.collection("tournaments").orderBy("createdAt", "desc").limit(50).get();
  return ok({ tournaments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), bracketExecutionEnabled: false, fakeBracketData: false })), foundation: tournamentSubdomainFoundation() }, "Tournament foundation loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const profileSnap = await db.collection("users").doc(user.uid).get();
  const permission = canCreateTournament({ ...(profileSnap.data() ?? {}), uid: user.uid, role: user.role, isAdmin: user.isAdmin });
  if (!permission.allowed) return fail("Tournament hosting requires Host, approved Enterprise, or allowed premium Creator access.", 403, permission, "TOURNAMENT_HOSTING_LOCKED");
  const validation = validateTournamentFoundation(body);
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  const ref = db.collection("tournaments").doc();
  const now = new Date().toISOString();
  const tournament = { id: ref.id, ...tournamentDraftFromInput(body, user.uid, now), bracketExecutionEnabled: false, paymentActivationEnabled: false, payoutExecutionEnabled: false, fakeParticipantsAllowed: false, fakeBracketAllowed: false, fakeWinnersAllowed: false };
  await ref.set(tournament);
  return ok({ tournament }, "Tournament draft created. No bracket, participants, payments, prize pool, winners, or payouts were created.");
}
