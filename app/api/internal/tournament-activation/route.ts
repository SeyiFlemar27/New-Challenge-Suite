import { getAdminDb } from "@/lib/firebase/admin";
import { processTournamentActivationJobs, processTournamentScheduledJobById } from "@/lib/server/tournament-activation";
import { processTournamentMatchLifecycleJobs, reconcileActiveTournamentMatchLifecycleJobs } from "@/lib/server/tournament-match-lifecycle-jobs";
import { createGoogleCloudTasksScheduler, reconcileTournamentActivationOutbox, verifyTournamentCloudTaskRequest } from "@/lib/server/tournament-cloud-tasks";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { isTournamentVerificationJob, processTournamentVerification } from "@/lib/server/tournament-runtime-verification";
import { isTournamentV3SchedulingReady } from "@/lib/server/tournament-cloud-tasks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail("Scheduled operation is not authorized.", 401, undefined, "CRON_UNAUTHORIZED");
  if (!isTournamentV3SchedulingReady()) return serverUnavailable("Tournament scheduling is disabled");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament activation scheduler");
  const now = new Date();
  const activationOutcomes = await processTournamentActivationJobs(db, now);
  const lifecycleOutcomes = await processTournamentMatchLifecycleJobs(db, now);
  const reconciled = await reconcileActiveTournamentMatchLifecycleJobs(db, now);
  let dispatch;
  try { dispatch = await reconcileTournamentActivationOutbox(db, undefined, now); }
  catch { dispatch = { configured: false, error: "OUTBOX_RECONCILIATION_FAILED" }; }
  return ok({ processed: activationOutcomes.length + lifecycleOutcomes.length, activationOutcomes, lifecycleOutcomes, reconciled, dispatch }, "Tournament scheduled jobs processed and reconciled.");
}

export async function POST(request: Request) {
  if (!await verifyTournamentCloudTaskRequest(request)) return fail("Scheduled operation is not authorized.", 401, undefined, "TASK_UNAUTHORIZED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament activation scheduler");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const version = Number(body.version);
  if (!jobId || !Number.isSafeInteger(version) || version < 1) return fail("Scheduled task payload is invalid.", 400, undefined, "TASK_PAYLOAD_INVALID");
  if (isTournamentVerificationJob(jobId)) {
    const result = await processTournamentVerification(db, jobId, version);
    return result.retry ? fail("Synthetic verification requests a bounded retry.", 503, undefined, result.code) : ok(result, "Synthetic delivery verified.");
  }
  if (!isTournamentV3SchedulingReady()) return serverUnavailable("Tournament scheduling is disabled");
  const outcome = await processTournamentScheduledJobById(db, jobId, version);
  if (outcome.code === "ACTIVATION_WINDOW_OPEN" || outcome.code === "TASK_NOT_DUE") {
    return new Response(JSON.stringify({ ok: false, code: "TASK_NOT_DUE" }), { status: 503, headers: { "content-type": "application/json", "retry-after": "2" } });
  }
  if (outcome.code === "TASK_ALREADY_RUNNING") {
    return new Response(JSON.stringify({ ok: false, code: "TASK_ALREADY_RUNNING" }), { status: 503, headers: { "content-type": "application/json", "retry-after": "30" } });
  }
  try {
    const reconciled = await reconcileActiveTournamentMatchLifecycleJobs(db);
    const scheduler = createGoogleCloudTasksScheduler();
    const dispatch = await reconcileTournamentActivationOutbox(db, scheduler);
    return ok({ status: outcome.status, code: outcome.code, reconciled, dispatch }, "Tournament scheduled task processed.");
  } catch {
    // The authoritative Firestore transition has completed. The recurring
    // reconciler will recover any newly-created outbox jobs.
  }
  return ok({ status: outcome.status, code: outcome.code }, "Tournament activation task processed.");
}
