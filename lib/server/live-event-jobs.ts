import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { eventOptions, eventTime, LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { expandLiveEventAnnouncement, deliverLiveEventEmail } from "@/lib/server/live-event-communications";
import { expireLiveEventCheckout } from "@/lib/server/live-event-checkout";
import { executeLiveEventRefund } from "@/lib/server/live-event-refunds";
import { getStripe } from "@/lib/stripe";
import { createGoogleCloudTasksScheduler, verifyTournamentCloudTaskRequest, type TournamentTaskScheduler } from "@/lib/server/tournament-cloud-tasks";
import { liveEventSponsorCutoff } from "@/lib/server/live-event-sponsor-cutoff";
import { processLiveEventCancellation } from "@/lib/server/live-event-cancellation";
import { expandLiveEventUpdate } from "@/lib/server/live-event-updates";

export { wakeLiveEventJob } from "@/lib/server/live-event-job-outbox";
function environment(env: NodeJS.ProcessEnv) {
  return { ...env, TOURNAMENT_CLOUD_TASKS_QUEUE: env.LIVE_EVENT_CLOUD_TASKS_QUEUE, TOURNAMENT_CLOUD_TASKS_WORKER_URL: env.LIVE_EVENT_CLOUD_TASKS_WORKER_URL, TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT: env.LIVE_EVENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT, TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT: env.LIVE_EVENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT, TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE: env.LIVE_EVENT_CLOUD_TASKS_OIDC_AUDIENCE };
}
export function createLiveEventScheduler(env: NodeJS.ProcessEnv = process.env): TournamentTaskScheduler | null {
  if (env.LIVE_EVENT_LIFECYCLE_SCHEDULER_ENABLED !== "true") return null;
  if (!env.LIVE_EVENT_CLOUD_TASKS_WORKER_URL?.endsWith("/api/internal/live-event-lifecycle")) throw new Error("LIVE_EVENT_WORKER_URL_INVALID");
  return createGoogleCloudTasksScheduler({ env: environment(env) });
}
export async function verifyLiveEventTask(request: Request) {
  if (process.env.LIVE_EVENT_LIFECYCLE_SCHEDULER_ENABLED !== "true") return false;
  return verifyTournamentCloudTaskRequest(request, { env: environment(process.env) });
}

export async function dispatchLiveEventJobs(db: Firestore, scheduler: TournamentTaskScheduler, now = Date.now()) {
  const jobs = await db.collection("liveEventJobs").where("status", "in", ["pending", "running"]).where("runAt", "<=", new Date(now + 86400000).toISOString()).orderBy("runAt").limit(100).get();
  let dispatched = 0;
  for (const row of jobs.docs) {
    const claim = await db.runTransaction(async tx => {
      const latest = await tx.get(row.ref), value = latest.data() ?? {};
      const interrupted = value.status === "running" && eventTime(value.leaseUntil) <= now;
      const lost = value.status === "pending" && value.dispatchState === "scheduled" && eventTime(value.runAt) + 300000 <= now;
      if (interrupted || lost) { tx.update(row.ref, { status: "pending", dispatchState: "pending", version: Number(value.version) + 1, runAt: new Date(now).toISOString(), recoveryReason: interrupted ? "worker_lease_expired" : "delivery_not_completed" }); return null; }
      if (value.status !== "pending" || value.dispatchState === "scheduled" || value.dispatchState === "dispatching" && eventTime(value.dispatchLeaseUntil) > now) return null;
      tx.update(row.ref, { dispatchState: "dispatching", dispatchLeaseUntil: new Date(now + 60000).toISOString() });
      return { version: Number(value.version), runAt: String(value.runAt) };
    });
    if (!claim) continue;
    try {
      const task = await scheduler.scheduleActivation({ jobId: row.id, ...claim });
      await db.runTransaction(async tx => { const latest = await tx.get(row.ref); if (Number(latest.data()?.version) === claim.version && latest.data()?.status === "pending") tx.update(row.ref, { dispatchState: "scheduled", taskName: task.taskName, dispatchedAt: new Date(now).toISOString() }); });
      dispatched++;
    } catch {
      await db.runTransaction(async tx => { const latest = await tx.get(row.ref); if (Number(latest.data()?.version) === claim.version) tx.update(row.ref, { dispatchState: "pending", dispatchError: "scheduler_unavailable" }); });
    }
  }
  return { dispatched };
}

export async function processLiveEventLifecycle(db: Firestore, eventId: string, now = Date.now()) {
  return db.runTransaction(async tx => {
    const { event, ref, challengeRef, challengeExists } = await readLiveEvent(db, tx, eventId);
    if (event.eventApprovalStatus !== "approved" || ["draft", "pending_review", "rejected", "cancelled", "deleted"].includes(String(event.status))) return { changed: false };
    const options = eventOptions(event), opens = eventTime(options.registrationOpensAt), closes = eventTime(options.registrationClosesAt), starts = Math.min(eventTime(event.startsAt),event.liveEventStartedAt?eventTime(event.liveEventStartedAt):Infinity), ends = eventTime(event.endsAt);
    if (![opens, closes, starts, ends].every(Number.isFinite) || opens >= closes || starts >= ends) throw new LiveEventPolicyError("EVENT_TIMELINE_REVIEW_REQUIRED");
    const status = now >= ends ? "completed" : now >= starts ? "in_progress" : now >= closes ? "registration_closed" : now >= opens ? "registration_open" : "scheduled";
    const cutoff=liveEventSponsorCutoff(event),closeFunding=Number.isFinite(cutoff)&&now>=cutoff&&!event.sponsorFundingClosedAt;
    const patch = { status, updatedAt: new Date(now).toISOString(), ...(status === "completed" ? { completedAt: event.completedAt ?? new Date(ends).toISOString() } : {}),...(closeFunding?{sponsorFundingClosedAt:new Date(cutoff).toISOString()}: {}) };
    if (event.status !== status || closeFunding) {
      tx.update(ref, patch); if (challengeExists) tx.update(challengeRef, patch);
      tx.create(db.collection("auditLogs").doc(), { actorId: "live_event_lifecycle", action: "live_event.phase_changed", eventId, before: { status: event.status }, after: { status }, createdAt: new Date(now).toISOString() });
    }
    return { changed: event.status !== status, status };
  });
}

export async function runLiveEventJob(db: Firestore, jobId: string, version: number, now = Date.now()) {
  const ref = db.collection("liveEventJobs").doc(jobId), token = randomUUID();
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), value = snap.data() ?? {};
    if (!snap.exists || Number(value.version) !== version || value.status !== "pending" || eventTime(value.runAt) > now) return null;
    tx.update(ref, { status: "running", token, leaseUntil: new Date(now + 300000).toISOString(), attempts: Number(value.attempts ?? 0) + 1 });
    return value;
  });
  if (!claim) return { executed: false };
  try {
    const eventId = String(claim.eventId);
    await processLiveEventLifecycle(db, eventId, now);
    const cancellation=await processLiveEventCancellation(db,eventId);
    const updates=await db.collection("liveEventUpdates").where("eventId","==",eventId).where("status","==","pending_notification").limit(10).get();
    for(const update of updates.docs)await expandLiveEventUpdate(db,update.id);
    if (claim.type === "announcement") await expandLiveEventAnnouncement(db, String(claim.subjectId), now);
    const dueNotices = await db.collection("liveEventAnnouncements").where("eventId", "==", eventId).where("status", "in", ["scheduled", "processing"]).limit(25).get();
    for (const notice of dueNotices.docs) if (eventTime(notice.data().runAt) <= now) await expandLiveEventAnnouncement(db, notice.id, now);
    const stripe = process.env.LIVE_EVENT_PAID_CHECKOUT_ENABLED === "true" || process.env.LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED === "true" ? getStripe() : null;
    if (stripe) {
      const {event:paymentEvent}=await db.runTransaction(tx=>readLiveEvent(db,tx,eventId));
      const cancelled=paymentEvent.status==="cancelled"&&Boolean(paymentEvent.cancelledAt);
      const bookings = await db.collection("liveEventBookings").where("eventId", "==", eventId).where("status", "==", "payment_pending").orderBy("reservationExpiresAt").limit(25).get();
      for (const booking of bookings.docs) if (cancelled||eventTime(booking.data().reservationExpiresAt) <= now) await expireLiveEventCheckout(db, stripe, booking.id,cancelled);
      if (process.env.LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED === "true") {
        const refunds = await db.collection("refundCases").where("eventId", "==", eventId).where("status", "in", ["approved", "executing"]).limit(25).get();
        for (const refund of refunds.docs) await executeLiveEventRefund(db, stripe, refund.id);
      }
    }
    await deliverLiveEventEmail(db, eventId);
    const { event } = await db.runTransaction(tx => readLiveEvent(db, tx, eventId));
    const options = eventOptions(event), nextTimes = [eventTime(options.registrationOpensAt), eventTime(options.registrationClosesAt), eventTime(event.startsAt), eventTime(event.endsAt)].filter(time => Number.isFinite(time) && time > now);
    // Bounded recovery polling remains durable; no request relies on an in-memory timer.
    const next = Math.min(now + 60000, ...nextTimes);
    const [pendingMail,pendingRefunds,pendingBookings,pendingNotices,ownNotice] = await Promise.all([
      db.collection("liveEventEmailOutbox").where("eventId","==",eventId).where("status","in",["pending","retry_pending","sending"]).limit(1).get(),
      db.collection("refundCases").where("eventId","==",eventId).where("status","in",["approved","executing","processing"]).limit(1).get(),
      db.collection("liveEventBookings").where("eventId","==",eventId).where("status","==","payment_pending").limit(1).get(),
      db.collection("liveEventAnnouncements").where("eventId","==",eventId).where("status","in",["scheduled","processing"]).limit(1).get(),
      claim.type === "announcement" ? db.collection("liveEventAnnouncements").doc(String(claim.subjectId)).get() : Promise.resolve(null),
    ]);
    const complete = claim.type === "announcement" ? ["queued","cancelled"].includes(String(ownNotice?.data()?.status)) : ["completed","cancelled"].includes(String(event.status)) && updates.empty && (event.status!=="cancelled"||cancellation.complete) && pendingMail.empty && pendingRefunds.empty && pendingBookings.empty && pendingNotices.empty;
    await db.runTransaction(async tx => {
      const latest = await tx.get(ref);
      if (latest.data()?.token !== token || Number(latest.data()?.version) !== version) return;
      tx.update(ref, { status: complete ? "completed" : "pending", dispatchState: complete ? "completed" : "pending", version: version + 1, runAt: new Date(next).toISOString(), leaseUntil: null, lastCompletedAt: new Date().toISOString() });
    });
    return { executed: true };
  } catch {
    await db.runTransaction(async tx => { const latest = await tx.get(ref); if (latest.data()?.token === token && Number(latest.data()?.version) === version) tx.update(ref, { status: "pending", dispatchState: "pending", version: version + 1, runAt: new Date(now + 60000).toISOString(), lastError: "event_processing_requires_retry", leaseUntil: null }); });
    return { executed: false, retryRequired: true };
  }
}
