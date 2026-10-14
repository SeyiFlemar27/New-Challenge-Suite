import { timingSafeEqual } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { processNormalChallengeLifecycle } from "@/lib/server/normal-lifecycle-jobs";
import { executeNormalPolicyRefund } from "@/lib/server/normal-refunds";
import { getStripe } from "@/lib/stripe";
import { clearNormalChallengeEarnings } from "@/lib/server/normal-earnings-clearance";
import { verifyNormalLifecycleTask, runNormalLifecycleJob, dispatchConfiguredNormalLifecycle } from "@/lib/server/normal-lifecycle-scheduler";
import { deliverNormalNotificationOutbox } from "@/lib/server/normal-notifications";
import { deliverNormalEmailOutbox } from "@/lib/server/normal-email";
import { createNormalLifecycleScheduler } from "@/lib/server/normal-lifecycle-scheduler";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
// Compatible with an explicitly configured authenticated recovery scheduler.
// This route does not register or activate a production schedule itself.
export async function GET(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  return POST(new Request(request.url, { method: "POST", headers, body: JSON.stringify({ action: "reconcile" }) }));
}
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const cronAuthorized = Boolean(secret && supplied.length === expected.length && timingSafeEqual(supplied, expected));
  if (!cronAuthorized && !await verifyNormalLifecycleTask(request)) return fail("Scheduled operation is not authorized.", 401, undefined, "UNAUTHORIZED");
  let body: unknown;
  try { body = await request.json(); } catch { return fail("A challenge ID is required.", 400); }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (payload.action === "health") {
    try {
      const scheduler = createNormalLifecycleScheduler();
      if (!scheduler || !await scheduler.verifyDispatchAccess?.()) return fail("Lifecycle dispatch readiness is not verified.", 503);
      return ok({ authenticatedWorker: true, dispatchAccessVerified: true, financialOperationsExecuted: false });
    } catch { return fail("Lifecycle federation or dispatch access is unavailable.", 503); }
  }
  if (payload.action === "reconcile") {
    const db = getAdminDb();
    if (!db) return serverUnavailable("Normal scheduling reconciliation");
    return ok(await dispatchConfiguredNormalLifecycle(db), "Normal scheduling outbox reconciled.");
  }
  const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
  if (jobId && (!jobId.startsWith("normal_") || !Number.isSafeInteger(payload.version) || Number(payload.version) < 1)) return fail("A valid persisted job version is required.", 400);
  const id = payload.challengeId ?? (jobId?.startsWith("normal_") ? jobId.slice(7) : null);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) return fail("A valid challenge ID is required.", 400);
  const db = getAdminDb();
  if (!db) return serverUnavailable("Normal lifecycle processing");
  const lifecycle = jobId ? await runNormalLifecycleJob(db, jobId, Number(payload.version)) : await processNormalChallengeLifecycle(db, id);
  const outcomes = [];
  if (process.env.NORMAL_AUTOMATIC_REFUNDS_ENABLED === "true") {
    const stripe = getStripe();
    if (stripe) {
      const cases = await db.collection("refundCases").where("challengeId", "==", id).get();
      for (const record of cases.docs) if (record.data().normalLifecyclePolicyVersion === 1 && record.data().automaticPolicyEligible) outcomes.push(await executeNormalPolicyRefund(db, record.id, stripe));
    }
  }
  const clearance = await clearNormalChallengeEarnings(db, id);
  const notifications = await deliverNormalNotificationOutbox(db, id);
  const email = await deliverNormalEmailOutbox(db, id);
  const dispatch = await dispatchConfiguredNormalLifecycle(db);
  return ok({ lifecycle, clearance, notifications, email, dispatch, refundOutcomes: outcomes, automaticRefundExecutionConfigured: process.env.NORMAL_AUTOMATIC_REFUNDS_ENABLED === "true" }, "Lifecycle processing completed.");
}
