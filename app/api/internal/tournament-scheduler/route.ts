import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { createGoogleCloudTasksScheduler, reconcileTournamentActivationOutbox, verifyTournamentCloudTaskRequest } from "@/lib/server/tournament-cloud-tasks";
import { reconcileActiveTournamentMatchLifecycleJobs } from "@/lib/server/tournament-match-lifecycle-jobs";
import { recordTournamentSchedulerReadiness, recoverPublishedTournamentRegistrations } from "@/lib/server/tournament-publication";
import { isTournamentV3SchedulingReady } from "@/lib/server/tournament-cloud-tasks";
import { isTournamentVerificationJob, recoverTournamentVerification } from "@/lib/server/tournament-runtime-verification";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const audience = process.env.TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE;
  if (!audience?.trim()) return serverUnavailable("Tournament scheduler reconciliation audience");
  if (!await verifyTournamentCloudTaskRequest(request, { expectedAudience: audience })) {
    return fail("Scheduled operation is not authorized.", 401, undefined, "TASK_UNAUTHORIZED");
  }
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown> | null;
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (isTournamentVerificationJob(jobId)) {
    const isolatedDb = getAdminDb();
    if (!isolatedDb) return serverUnavailable("Isolated Tournament verification");
    const id = jobId.endsWith("_reconcile") ? jobId.slice(0, -"_reconcile".length) : jobId;
    try { return ok(await recoverTournamentVerification(isolatedDb, id, Number(body?.version)), "Isolated recovery processed."); }
    catch { return fail("Isolated recovery could not dispatch.", 503, undefined, "VERIFICATION_RECOVERY_FAILED"); }
  }
  if (!isTournamentV3SchedulingReady()) return serverUnavailable("Tournament scheduling is disabled");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament scheduler reconciliation");
  let scheduler;
  try { scheduler = createGoogleCloudTasksScheduler(); }
  catch { return serverUnavailable("Tournament scheduler configuration"); }
  if (!scheduler) return serverUnavailable("Tournament scheduler configuration");
  const lifecycle = await reconcileActiveTournamentMatchLifecycleJobs(db);
  const result = await reconcileTournamentActivationOutbox(db, scheduler);
  const healthy = await recordTournamentSchedulerReadiness(db, scheduler, result);
  if (!healthy) return serverUnavailable("Tournament scheduler dispatch readiness");
  const registration = await recoverPublishedTournamentRegistrations(db);
  return ok({ lifecycle, dispatch: result, registration }, "Tournament lifecycle jobs reconciled and dispatched.");
}
