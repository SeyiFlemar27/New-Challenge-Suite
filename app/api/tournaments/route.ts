import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canCreateTournament } from "@/lib/server/tournament-permissions";
import { evaluateTournamentReadiness, tournamentDraftFromInput, tournamentSubdomainFoundation } from "@/lib/server/tournaments";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament listing");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  let query: FirebaseFirestore.Query = db.collection("tournaments");
  if (status) query = query.where("status", "==", status);
  if (category) query = query.where("category", "==", category);
  const snap = await query.orderBy("createdAt", "desc").limit(50).get();
  return ok({ tournaments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), bracketExecutionEnabled: true, fakeBracketData: false })), foundation: tournamentSubdomainFoundation(), emptyState: snap.empty ? "No tournaments found from backend state." : null }, "Tournament records loaded.");
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
  const draft = tournamentDraftFromInput(body, user.uid, now);
  const tournament = { id: ref.id, ...draft, readiness: evaluateTournamentReadiness({ id: ref.id, ...draft }), bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false, fakeParticipantsAllowed: false, fakeBracketAllowed: false, fakeWinnersAllowed: false };
  await ref.set(tournament);
  return ok({ tournament }, "Tournament draft created. No bracket, participants, payments, prize pool, winners, or payouts were created.");
}
