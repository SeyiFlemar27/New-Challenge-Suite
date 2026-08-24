import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adminTournamentActionFoundation, deriveTournamentCorrectionImpact } from "@/lib/server/tournament-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminPermission(request, "challenges.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament detail");
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const [participants, rounds, matches, submissions, votes, judges, judgeScores, prizePools, proposals, reports, disputes, audits] = await Promise.all([
    db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentMatches").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentVotes").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentJudges").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentJudgeScores").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentPrizePools").where("tournamentId", "==", id).limit(20).get(),
    db.collection("tournamentSponsorProposals").where("tournamentId", "==", id).limit(50).get(),
    db.collection("tournamentReports").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentDisputes").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentAuditEvents").where("tournamentId", "==", id).limit(100).get()
  ]);
  const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  } as Record<string, unknown> & { id: string }));
  const matchRows = rows(matches);
  const impactMatchId = new URL(request.url).searchParams.get("impactMatchId") ?? "";
  const impact = impactMatchId ? deriveTournamentCorrectionImpact(matchRows as Parameters<typeof deriveTournamentCorrectionImpact>[0], impactMatchId) : null;
  const activity = impact ? {
    submissions: rows(submissions).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    votes: rows(votes).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    judging: rows(judgeScores).filter((item) => impact.affectedMatchIds.includes(String(item.matchId ?? ""))).length,
    settlementSensitive: impact.hasResolvedDownstream || ["results_under_review", "completed"].includes(String(tournamentSnap.data()?.status ?? ""))
  } : null;
  return ok({ tournament: { id: tournamentSnap.id, ...tournamentSnap.data() }, participants: rows(participants), rounds: rows(rounds), matches: matchRows, submissions: rows(submissions), votes: rows(votes), judges: rows(judges), judgeScores: rows(judgeScores), prizePools: rows(prizePools), sponsorProposals: rows(proposals), reports: rows(reports), disputes: rows(disputes), audits: rows(audits), correctionImpact: impact ? { ...impact, activity, automaticCorrectionAllowed: impact.futureOnly && !activity?.submissions && !activity?.votes && !activity?.judging && !activity?.settlementSensitive } : null }, "Admin tournament detail loaded.");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdminPermission(request, "challenges.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament action");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").slice(0, 500);
  const { id } = await context.params;
  const foundation = adminTournamentActionFoundation(action);
  if (!foundation.adminRequired) return fail("Unsupported admin tournament action.", 400, foundation, "ADMIN_TOURNAMENT_ACTION_UNSUPPORTED");
  if (reason.length < 5) return fail("Admin tournament actions require a reason.", 400, foundation, "ADMIN_TOURNAMENT_REASON_REQUIRED");
  const now = new Date().toISOString();
  await db.collection("tournamentAuditEvents").doc(`${id}_${action}_${now}`).set({ id: `${id}_${action}_${now}`, tournamentId: id, actorId: user.uid, action, reason, createdAt: now, metadata: { foundation } });
  return ok({ action, auditRequired: true, payoutProviderCalled: false, balanceOverwriteAllowed: false, rawVoteTotalEditable: false }, "Admin tournament action was audited. No payout, refund, raw vote edit, or balance overwrite occurred.");
}
