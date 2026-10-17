import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { readJson, serverUnavailable } from "@/lib/server/responses";
import { confirmTournamentResult } from "@/lib/server/tournament-result-confirmation";
import { reconcileTournamentLifecycleAfterStateChange } from "@/lib/server/tournament-match-lifecycle-jobs";

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
  const result = await confirmTournamentResult(db, id, body, user);
  if (result.ok) {
    try { await reconcileTournamentLifecycleAfterStateChange(db, id); }
    catch { console.error("Tournament advancement job reconciliation failed", { tournamentId: id, code: "RECONCILIATION_FAILED" }); }
  }
  return result;
}
