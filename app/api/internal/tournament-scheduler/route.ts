import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { createGoogleCloudTasksScheduler, reconcileTournamentActivationOutbox, verifyTournamentCloudTaskRequest } from "@/lib/server/tournament-cloud-tasks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const audience = process.env.TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE;
  if (!audience?.trim()) return serverUnavailable("Tournament scheduler reconciliation audience");
  if (!await verifyTournamentCloudTaskRequest(request, { expectedAudience: audience })) {
    return fail("Scheduled operation is not authorized.", 401, undefined, "TASK_UNAUTHORIZED");
  }
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament scheduler reconciliation");
  let scheduler;
  try { scheduler = createGoogleCloudTasksScheduler(); }
  catch { return serverUnavailable("Tournament scheduler configuration"); }
  if (!scheduler) return serverUnavailable("Tournament scheduler configuration");
  const result = await reconcileTournamentActivationOutbox(db, scheduler);
  return ok(result, "Tournament scheduler outbox reconciled.");
}
