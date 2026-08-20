import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canCreateTournament } from "@/lib/server/tournament-permissions";
import { isFirestoreMissingIndexError } from "@/lib/server/tournament-public";
import { evaluateTournamentReadiness, tournamentDraftFromInput, tournamentSubdomainFoundation } from "@/lib/server/tournaments";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament listing");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  try {
    const snap = await db.collection("tournaments").limit(100).get();
    const tournaments = (snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data(), bracketExecutionEnabled: true, fakeBracketData: false }) as Record<string, unknown> & { id: string })
      .filter((item) => !status || item.status === status)
      .filter((item) => !category || item.category === category)
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
      .slice(0, 50));
    return ok({ tournaments, foundation: tournamentSubdomainFoundation(), emptyState: tournaments.length ? null : "No tournaments found from backend state." }, "Tournament records loaded.");
  } catch (error) {
    if (isFirestoreMissingIndexError(error)) {
      console.warn("[tournament-firestore-index]", { scope: "api:tournaments:list", message: "Firestore index required for this query." });
      return ok({ tournaments: [], foundation: tournamentSubdomainFoundation(), emptyState: "Tournament data is not available yet. Please try again shortly." }, "Tournament listing unavailable.");
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const requestedStatus = body.status === "pending_review" ? "pending_review" : "draft";
  if (body.status && body.status !== "draft" && body.status !== "pending_review") return fail("Tournament status is not valid for this action.", 422, undefined, "TOURNAMENT_STATUS_INVALID");
  const profileSnap = await db.collection("users").doc(user.uid).get();
  const permission = canCreateTournament({ ...(profileSnap.data() ?? {}), uid: user.uid, role: user.role, isAdmin: user.isAdmin });
  if (!permission.allowed) return fail("Tournament hosting requires Host, approved Enterprise, or allowed premium Creator access.", 403, permission, "TOURNAMENT_HOSTING_LOCKED");
  const validation = validateTournamentFoundation(body, { publish: requestedStatus === "pending_review" });
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  const ref = db.collection("tournaments").doc();
  const now = new Date().toISOString();
  const draft = tournamentDraftFromInput(body, user.uid, now);
  const readiness = evaluateTournamentReadiness({ id: ref.id, ...draft });
  if (requestedStatus === "pending_review" && !readiness.ready) return fail("Tournament details need attention before review.", 422, { fieldErrors: readiness.errors }, "TOURNAMENT_NOT_READY");
  const tournament = { id: ref.id, ...draft, status: requestedStatus, submittedAt: requestedStatus === "pending_review" ? now : null, readiness, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false, fakeParticipantsAllowed: false, fakeBracketAllowed: false, fakeWinnersAllowed: false };
  const batch = db.batch();
  batch.set(ref, tournament);
  if (requestedStatus === "pending_review") {
    batch.set(db.collection("tournamentReviewRequests").doc(`${ref.id}_initial`), { id: `${ref.id}_initial`, tournamentId: ref.id, hostId: user.uid, status: "pending_review", revision: 1, createdAt: now, updatedAt: now });
    batch.set(db.collection("tournamentAuditEvents").doc(`${ref.id}_submitted_initial`), { id: `${ref.id}_submitted_initial`, tournamentId: ref.id, actorId: user.uid, action: "submitted_for_review", createdAt: now, metadata: { status: "pending_review" } });
  }
  await batch.commit();
  return ok({ tournament }, requestedStatus === "pending_review" ? "Tournament submitted for admin review." : "Tournament draft created. No bracket, participants, payments, prize pool, winners, or payouts were created.");
}
