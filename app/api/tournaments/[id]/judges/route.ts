import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { validateJudgeRubric } from "@/lib/server/tournament-operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament judges");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, { id: tournamentSnap.id, ...tournamentSnap.data() }, ["host", "manager", "judge_coordinator"]);
  if (!permission.allowed) return fail("Judge coordinator permission is required.", 403, permission, "JUDGE_COORDINATOR_REQUIRED");
  const rubric = Array.isArray(body.rubric) ? body.rubric as Array<{ name: string; weight: number }> : [];
  if (rubric.length) {
    const rubricValidation = validateJudgeRubric(rubric);
    if (!rubricValidation.valid) return fail("Judge rubric weights must total 100%.", 400, rubricValidation, "RUBRIC_TOTAL_INVALID");
  }
  const judgeUserId = String(body.judgeUserId ?? "");
  if (!judgeUserId) return fail("Judge user is required.", 400, undefined, "JUDGE_USER_REQUIRED");
  const ref = db.collection("tournamentJudges").doc(`${id}_${judgeUserId}`);
  const judge = { id: ref.id, tournamentId: id, userId: judgeUserId, status: "pending", rubric, invitedBy: user.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await ref.set(judge, { merge: true });
  return ok({ judge }, "Judge invitation created. No judging score is official until submitted and calculated server-side.");
}
