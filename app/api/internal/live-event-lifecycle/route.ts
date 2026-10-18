import { timingSafeEqual } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { createLiveEventScheduler, dispatchLiveEventJobs, runLiveEventJob, verifyLiveEventTask } from "@/lib/server/live-event-jobs";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET, supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const recoveryAuthorized = Boolean(secret && supplied.length === expected.length && timingSafeEqual(supplied, expected));
  if (!recoveryAuthorized && !await verifyLiveEventTask(request)) return fail("Scheduled operation is not authorized.", 401);
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = parsed.body ?? {}, db = getAdminDb();
  if (!db) return serverUnavailable("Event processing");
  if (body.action === "reconcile") {
    const scheduler = createLiveEventScheduler();
    return ok(scheduler ? { configured: true, ...await dispatchLiveEventJobs(db, scheduler) } : { configured: false, financialOperationsExecuted: false });
  }
  if (typeof body.jobId !== "string" || !/^(event_|announcement_)[A-Za-z0-9_-]{1,150}$/.test(body.jobId) || !Number.isSafeInteger(body.version) || body.version < 1) return fail("A valid persisted event job and version are required.", 422);
  const result = await runLiveEventJob(db, body.jobId, body.version);
  const scheduler = createLiveEventScheduler();
  if (scheduler) await dispatchLiveEventJobs(db, scheduler);
  return ok(result);
}
export async function GET(request: Request) {
  return POST(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "reconcile" }) }));
}
