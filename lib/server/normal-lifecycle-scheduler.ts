import type { Firestore } from "firebase-admin/firestore";
import { createGoogleCloudTasksScheduler, verifyTournamentCloudTaskRequest, type TournamentTaskScheduler } from "@/lib/server/tournament-cloud-tasks";
import { processNormalChallengeLifecycle } from "@/lib/server/normal-lifecycle-jobs";
import { clearNormalChallengeEarnings } from "@/lib/server/normal-earnings-clearance";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";

function normalCloudTaskEnvironment(env: NodeJS.ProcessEnv) {
  return { ...env, TOURNAMENT_CLOUD_TASKS_QUEUE: env.NORMAL_CLOUD_TASKS_QUEUE, TOURNAMENT_CLOUD_TASKS_WORKER_URL: env.NORMAL_CLOUD_TASKS_WORKER_URL, TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT: env.NORMAL_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT, TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT: env.NORMAL_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT, TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE: env.NORMAL_CLOUD_TASKS_OIDC_AUDIENCE };
}
export function createNormalLifecycleScheduler(env: NodeJS.ProcessEnv = process.env): TournamentTaskScheduler | null {
  if (env.NORMAL_LIFECYCLE_SCHEDULER_ENABLED !== "true") return null;
  if (!env.NORMAL_CLOUD_TASKS_WORKER_URL?.endsWith("/api/internal/normal-lifecycle")) throw new Error("NORMAL_WORKER_URL_INVALID");
  return createGoogleCloudTasksScheduler({ env: normalCloudTaskEnvironment(env) });
}
export async function verifyNormalLifecycleTask(request: Request, env: NodeJS.ProcessEnv = process.env) {
  if (env.NORMAL_LIFECYCLE_SCHEDULER_ENABLED !== "true") return false;
  return verifyTournamentCloudTaskRequest(request, { env: normalCloudTaskEnvironment(env) });
}
export async function dispatchNormalLifecycleJobs(db: Firestore, scheduler: TournamentTaskScheduler, now = new Date()) {
  const jobs = await db.collection("normalLifecycleJobs").where("dispatchState", "in", ["pending", "dispatching"]).orderBy("runAt", "asc").limit(25).get();
  let dispatched = 0;
  for (const job of jobs.docs) {
    const claimed = await db.runTransaction(async transaction => {
      const latest = await transaction.get(job.ref);
      const data = latest.data() ?? {};
      if (!latest.exists || data.status !== "pending" || (data.dispatchState === "dispatching" && normalTimestamp(data.dispatchLeaseUntil) > now.getTime()) || data.dispatchState === "scheduled") return null;
      transaction.update(job.ref, { dispatchState: "dispatching", dispatchLeaseUntil: new Date(now.getTime() + 60_000).toISOString(), updatedAt: now.toISOString() });
      return { version: Number(data.version), runAt: String(data.runAt) };
    });
    if (!claimed) continue;
    try {
      const task = await scheduler.scheduleActivation({ jobId: job.id, ...claimed });
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(job.ref);
        if (Number(latest.data()?.version) === claimed.version) transaction.update(job.ref, { dispatchState: "scheduled", taskName: task.taskName, dispatchedAt: now.toISOString() });
      });
      dispatched++;
    } catch {
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(job.ref);
        if (Number(latest.data()?.version) === claimed.version) transaction.update(job.ref, { dispatchState: "pending", dispatchError: "SCHEDULER_UNAVAILABLE", runAt: new Date(now.getTime() + 60_000).toISOString() });
      });
    }
  }
  return { dispatched };
}
export async function dispatchConfiguredNormalLifecycle(db: Firestore) {
  if (process.env.NORMAL_LIFECYCLE_SCHEDULER_ENABLED !== "true") return { configured: false };
  try {
    const scheduler = createNormalLifecycleScheduler();
    if (!scheduler) return { configured: false };
    await recoverNormalLifecycleJobs(db);
    return { configured: true, ...await dispatchNormalLifecycleJobs(db, scheduler) };
  } catch { return { configured: false, reason: "NORMAL_SCHEDULER_CONFIGURATION_OR_ACCESS_UNAVAILABLE" }; }
}
export async function recoverNormalLifecycleJobs(db: Firestore, now = new Date()) {
  const due = await db.collection("normalLifecycleJobs").where("runAt", ">", "").where("runAt", "<=", now.toISOString()).orderBy("runAt", "asc").limit(100).get();
  let recovered = 0;
  for (const job of due.docs) {
    const result = await db.runTransaction(async transaction => {
      const current = await transaction.get(job.ref);
      const data = current.data() ?? {};
      const lostDelivery = data.status === "pending" && data.dispatchState === "scheduled" && normalTimestamp(data.runAt) + 5 * 60_000 <= now.getTime();
      const interrupted = data.status === "running" && normalTimestamp(data.leaseUntil) <= now.getTime();
      if (!lostDelivery && !interrupted) return false;
      transaction.update(job.ref, { version: Number(data.version) + 1, status: "pending", dispatchState: "pending", runAt: now.toISOString(), leaseUntil: null, recoveryReason: lostDelivery ? "task_delivery_not_completed" : "worker_lease_expired", updatedAt: now.toISOString() });
      return true;
    });
    if (result) recovered++;
  }
  return { recovered };
}
export async function runNormalLifecycleJob(db: Firestore, jobId: string, expectedVersion?: number, testNow?: Date) {
  const now = testNow ?? new Date();
  const ref = db.collection("normalLifecycleJobs").doc(jobId);
  const claim = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const job = snap.data() ?? {};
    if (!snap.exists || (expectedVersion !== undefined && Number(job.version) !== expectedVersion) || job.status === "completed" || (job.status === "running" && normalTimestamp(job.leaseUntil) > now.getTime()) || normalTimestamp(job.runAt) > now.getTime()) return null;
    transaction.update(ref, { status: "running", leaseUntil: new Date(now.getTime() + 5 * 60_000).toISOString(), updatedAt: now.toISOString() });
    return { version: Number(job.version), challengeId: String(job.challengeId) };
  });
  if (!claim) return { skipped: true };
  try {
    const lifecycle = await processNormalChallengeLifecycle(db, claim.challengeId, testNow ?? (() => new Date()));
    const clearance = await clearNormalChallengeEarnings(db, claim.challengeId, now);
    const [challenge, submissions, credits, liabilities, notices, entries] = await Promise.all([db.collection("challenges").doc(claim.challengeId).get(), db.collection("submissions").where("challengeId", "==", claim.challengeId).get(), db.collection("cashLedger").where("challengeId", "==", claim.challengeId).get(), db.collection("refundCases").where("challengeId", "==", claim.challengeId).get(), db.collection("normalNotificationOutbox").where("challengeId", "==", claim.challengeId).get(), db.collection("challengeEntryPayments").where("challengeId", "==", claim.challengeId).get()]);
    const data = challenge.data() ?? {};
    const times = [data.registrationOpensAt, data.submissionStartAt, data.submissionDeadline, data.votingStartsAt, data.effectiveVotingEndsAt, ...submissions.docs.flatMap(submission => { const entry = submission.data(); return [entry.resubmissionDeadline, entry.correctionAutoReviewAt, entry.appealDeadline, entry.submittedAt ? new Date(normalTimestamp(entry.submittedAt) + 24 * 60 * 60_000).toISOString() : null]; }), ...credits.docs.map(credit => credit.data().holdUntil)].map(normalTimestamp).filter(time => Number.isFinite(time) && time > now.getTime());
    const noticesPending = notices.docs.some(notice => notice.data().status === "pending");
    const emailNotices = process.env.NORMAL_EMAIL_DELIVERY_ENABLED === "true" ? await db.collection("normalEmailOutbox").where("challengeId", "==", claim.challengeId).get() : null;
    const emailPending = emailNotices?.docs.some(notice => !["accepted", "review_required"].includes(String(notice.data().status))) ?? false;
    for (const entry of entries.docs) {
      const payment = entry.data();
      const expiry = normalTimestamp(payment.reservationExpiresAt);
      if (payment.status === "pending" && Number.isFinite(expiry) && expiry > now.getTime()) times.push(expiry);
    }
    if (noticesPending) times.push(now.getTime() + 1000);
    if (emailPending) times.push(now.getTime() + 60_000);
    const complete = !noticesPending && !emailPending && ["completed", "winners_announced", "cancelled"].includes(String(data.status)) && credits.docs.every(credit => !["pending_review", "pending_hold"].includes(String(credit.data().status))) && liabilities.docs.every(liability => ["succeeded", "rejected", "cancelled", "financial_hold"].includes(String(liability.data().status)));
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(ref);
      if (Number(latest.data()?.version) !== claim.version) return;
      transaction.update(ref, { version: claim.version + 1, status: complete ? "completed" : "pending", runAt: complete ? null : new Date(times.length ? Math.min(...times) : now.getTime() + 60_000).toISOString(), dispatchState: complete ? "completed" : "pending", leaseUntil: null, updatedAt: now.toISOString() });
    });
    return { lifecycle, clearance };
  } catch (error) {
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(ref);
      if (Number(latest.data()?.version) === claim.version) transaction.update(ref, { status: "pending", dispatchState: "pending", lastError: "LIFECYCLE_RETRY_REQUIRED", runAt: new Date(now.getTime() + 60_000).toISOString(), leaseUntil: null });
    });
    throw error;
  }
}
