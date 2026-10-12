import { getAdminDb } from "@/lib/firebase/admin";
import { processTournamentActivationJobById, processTournamentActivationJobs } from "@/lib/server/tournament-activation";
import { verifyTournamentCloudTaskRequest } from "@/lib/server/tournament-cloud-tasks";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail("Scheduled operation is not authorized.", 401, undefined, "CRON_UNAUTHORIZED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament activation scheduler");
  const outcomes = await processTournamentActivationJobs(db);
  return ok({ processed: outcomes.length, outcomes }, "Tournament activation jobs processed.");
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
  const outcome = await processTournamentActivationJobById(db, jobId, version);
  if (outcome.code === "ACTIVATION_WINDOW_OPEN") {
    return new Response(JSON.stringify({ ok: false, code: "TASK_NOT_DUE" }), { status: 503, headers: { "content-type": "application/json", "retry-after": "2" } });
  }
  return ok({ status: outcome.status, code: outcome.code }, "Tournament activation task processed.");
}
