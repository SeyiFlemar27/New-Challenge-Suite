import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createGoogleCloudTasksScheduler, dispatchTournamentActivationOutbox, isTournamentV3SchedulingReady, reconcileTournamentActivationOutbox, verifyTournamentCloudTaskRequest } from "../lib/server/tournament-cloud-tasks.ts";
import { ensureTournamentMatchLifecycleJobs, processTournamentMatchLifecycleJobById } from "../lib/server/tournament-match-lifecycle-jobs.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
process.env.FIREBASE_PROJECT_ID = projectId;
const app = initializeApp({ projectId }, "tournament-cloud-tasks-tests");
const db = getFirestore(app);
const runId = "cloud_tasks_" + randomUUID().replaceAll("-", "");
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

const env = {
  GOOGLE_CLOUD_PROJECT: "challenge-suite-test",
  GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012",
  GOOGLE_WORKLOAD_IDENTITY_POOL_ID: "vercel-pool",
  GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-provider",
  CLOUD_TASKS_LOCATION: "us-central1",
  TOURNAMENT_CLOUD_TASKS_QUEUE: "tournament-jobs",
  TOURNAMENT_CLOUD_TASKS_WORKER_URL: "https://challenge-suite.example/api/internal/tournament-activation",
  TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT: "tasks-enqueuer@challenge-suite-test.iam.gserviceaccount.com",
  TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT: "tasks-invoker@challenge-suite-test.iam.gserviceaccount.com"
};

equal(createGoogleCloudTasksScheduler({ env: {} }), null, "adapter stays disabled when no Cloud Tasks configuration is present");
assertions += 1;
check(!isTournamentV3SchedulingReady(env), "scheduler remains unavailable until explicit activation and full match-lifecycle flags and reconciler audience are configured");
const schedulersEnabled = { ...env, TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED: "true", TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED: "true", TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE: "https://challenge-suite.example/api/internal/tournament-scheduler" };
check(isTournamentV3SchedulingReady(schedulersEnabled), "scheduler readiness requires complete Cloud Tasks and all lifecycle scheduling flags");
check(!isTournamentV3SchedulingReady({ ...env, TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED: "true", TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE: "https://challenge-suite.example/api/internal/tournament-scheduler" }), "activation alone cannot enable V3 without match-lifecycle scheduling");
check(!isTournamentV3SchedulingReady({ ...env, TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED: "true" }), "scheduler cannot be enabled without its protected reconciler audience");
check(!isTournamentV3SchedulingReady({ GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT, TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED: "true" }), "partial cloud configuration safely leaves tournament scheduling unavailable");
assert.throws(() => createGoogleCloudTasksScheduler({ env: { GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT } }), /configuration is incomplete/);
assertions += 1;
assert.throws(() => createGoogleCloudTasksScheduler({ env: { ...env, TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT: "tasks-invoker@another-project.iam.gserviceaccount.com" } }), /must belong to the configured queue project/);
assertions += 1;

const requests = [];
const scheduler = createGoogleCloudTasksScheduler({
  env,
  getAccessToken: async () => "unit-access-token",
  fetcher: async (url, init) => {
    requests.push({ url, init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }
});
check(scheduler, "valid Workload Identity and Cloud Tasks config creates an adapter");
const runAt = new Date(Date.now() + 30_000).toISOString();
const scheduled = await scheduler.scheduleActivation({ jobId: runId + "_activation_v1", version: 1, runAt });
equal(requests.length, 1, "one task is submitted");
equal(requests[0].url, "https://cloudtasks.googleapis.com/v2/projects/challenge-suite-test/locations/us-central1/queues/tournament-jobs/tasks", "task uses the configured project, region, and queue");
equal(requests[0].init.method, "POST", "task creation uses POST");
equal(requests[0].init.headers.authorization, "Bearer unit-access-token", "Google API auth is attached from the injected token provider");
const payload = JSON.parse(requests[0].init.body).task;
equal(payload.scheduleTime, runAt, "server runAt is the Cloud Tasks scheduled time");
equal(payload.httpRequest.url, env.TOURNAMENT_CLOUD_TASKS_WORKER_URL, "task invokes the configured HTTPS worker");
equal(payload.httpRequest.oidcToken.serviceAccountEmail, env.TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT, "task requests an OIDC token from the dedicated invoker identity");
equal(payload.httpRequest.oidcToken.audience, env.TOURNAMENT_CLOUD_TASKS_WORKER_URL, "OIDC audience defaults to the worker URL");
equal(Buffer.from(payload.httpRequest.body, "base64").toString("utf8"), JSON.stringify({ jobId: runId + "_activation_v1", version: 1 }), "task body contains only the job id and version");
equal(scheduled.taskName, JSON.parse(requests[0].init.body).task.name, "task name is stable and explicit");

const conflictScheduler = createGoogleCloudTasksScheduler({ env, getAccessToken: async () => "unit-access-token", fetcher: async () => new Response("{}", { status: 409 }) });
const conflict = await conflictScheduler.scheduleActivation({ jobId: runId + "_activation_v1", version: 1, runAt });
equal(conflict.taskName, scheduled.taskName, "Cloud Tasks ALREADY_EXISTS is treated as an idempotent enqueue");
const failedScheduler = createGoogleCloudTasksScheduler({ env, getAccessToken: async () => "unit-access-token", fetcher: async () => new Response("{}", { status: 503 }) });
await assert.rejects(() => failedScheduler.scheduleActivation({ jobId: runId + "_activation_v1", version: 1, runAt }), (error) => error.code === "CLOUD_TASKS_HTTP_503");
assertions += 1;

const claims = { iss: "https://accounts.google.com", aud: "https://challenge-suite.example/api/internal/tournament-activation", email: env.TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT, email_verified: true };
const authRequest = new Request("https://challenge-suite.example/api/internal/tournament-activation", { headers: { authorization: "Bearer test-id-token" } });
let verifiedToken = "";
check(await verifyTournamentCloudTaskRequest(authRequest, { env, verifyToken: async (token) => { verifiedToken = token; return claims; } }), "valid signed invoker claims authorize task delivery");
equal(verifiedToken, "test-id-token", "only the bearer token is passed to the token verifier");
check(!await verifyTournamentCloudTaskRequest(new Request(authRequest.url), { env, verifyToken: async () => claims }), "missing bearer token is denied");
check(!await verifyTournamentCloudTaskRequest(authRequest, { env, expectedAudience: "https://wrong.example/", verifyToken: async () => claims }), "audience mismatch is denied");
check(!await verifyTournamentCloudTaskRequest(authRequest, { env, verifyToken: async () => ({ ...claims, email: "other@challenge-suite-test.iam.gserviceaccount.com" }) }), "a different service account is denied");

const jobId = runId + "_outbox_v1";
await db.collection("tournamentJobs").doc(jobId).set({ id: jobId, tournamentId: runId, type: "activate_full_tournament", status: "pending", version: 1, runAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0 });
let enqueueCalls = 0;
const emulatorScheduler = { scheduleActivation: async () => { enqueueCalls += 1; return { taskName: "test-task/" + jobId }; } };
const outbox = await dispatchTournamentActivationOutbox(db, jobId, emulatorScheduler, new Date());
equal(outbox.status, "scheduled", "transactional Firestore outbox records a successful dispatch");
equal(enqueueCalls, 1, "outbox submits one task");
equal((await db.collection("tournamentJobs").doc(jobId).get()).data().schedulerDispatchState, "scheduled", "job retains the durable dispatched state");
const duplicate = await dispatchTournamentActivationOutbox(db, jobId, emulatorScheduler, new Date());
equal(duplicate.status, "scheduled", "repeated dispatch is idempotent");
equal(enqueueCalls, 1, "duplicate dispatch does not call Cloud Tasks again");

const lifecycleDispatchId = runId + "_lifecycle_outbox_v1";
await db.collection("tournamentJobs").doc(lifecycleDispatchId).set({ id: lifecycleDispatchId, tournamentId: runId, matchId: runId + "_match", type: "process_tournament_match_lifecycle", status: "pending", version: 1, runAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0 });
const lifecycleDispatch = await dispatchTournamentActivationOutbox(db, lifecycleDispatchId, emulatorScheduler, new Date());
equal(lifecycleDispatch.status, "scheduled", "the shared durable outbox dispatches match lifecycle jobs");
equal(enqueueCalls, 2, "one Cloud Task is submitted for the lifecycle outbox record");

const failedJobId = runId + "_outbox_failure_v1";
await db.collection("tournamentJobs").doc(failedJobId).set({ id: failedJobId, tournamentId: runId, type: "activate_full_tournament", status: "pending", version: 1, runAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0 });
const failed = await dispatchTournamentActivationOutbox(db, failedJobId, { scheduleActivation: async () => { throw Object.assign(new Error("sanitized"), { code: "CLOUD_TASKS_HTTP_503" }); } }, new Date());
equal(failed.status, "pending", "enqueue failures leave the job durably pending");
const failedRecord = (await db.collection("tournamentJobs").doc(failedJobId).get()).data();
equal(failedRecord.schedulerLastErrorCode, "CLOUD_TASKS_HTTP_503", "only the sanitized provider status is retained");
check(Date.parse(failedRecord.schedulerRetryAt) > Date.now(), "failed enqueue uses bounded retry backoff");

const concurrentId = runId + "_outbox_concurrent_v1";
await db.collection("tournamentJobs").doc(concurrentId).set({ id: concurrentId, tournamentId: runId, type: "activate_full_tournament", status: "pending", version: 1, runAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0 });
let release;
const gate = new Promise((resolve) => { release = resolve; });
let signalScheduleReached;
const scheduleReached = new Promise((resolve) => { signalScheduleReached = resolve; });
let concurrentCalls = 0;
const slowScheduler = { scheduleActivation: async () => { concurrentCalls += 1; signalScheduleReached(); await gate; return { taskName: "test-task/" + concurrentId }; } };
const first = dispatchTournamentActivationOutbox(db, concurrentId, slowScheduler, new Date());
await scheduleReached;
const second = await dispatchTournamentActivationOutbox(db, concurrentId, slowScheduler, new Date());
equal(second.reason, "DISPATCH_IN_PROGRESS", "a concurrent dispatcher respects the active lease");
release();
equal((await first).status, "scheduled", "leased dispatcher persists success");
equal(concurrentCalls, 1, "concurrent delivery schedules only once");

const reconcilePendingId = runId + "_reconcile_pending_v1";
await db.collection("tournamentJobs").doc(reconcilePendingId).set({ id: reconcilePendingId, tournamentId: runId, type: "activate_full_tournament", status: "pending", version: 1, runAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0, createdAt: new Date().toISOString() });
const reconciledCalls = [];
const reconciled = await reconcileTournamentActivationOutbox(db, { scheduleActivation: async (task) => { reconciledCalls.push(task.jobId); return { taskName: "test-task/" + task.jobId }; } }, new Date(), 100);
check(reconciled.configured && reconciledCalls.includes(reconcilePendingId), "the reconciler recovers a Firestore-committed pending outbox record");
equal((await db.collection("tournamentJobs").doc(reconcilePendingId).get()).data().schedulerDispatchState, "scheduled", "reconciliation persists its task dispatch state");

const expiredLeaseId = runId + "_reconcile_expired_lease_v1";
await db.collection("tournamentJobs").doc(expiredLeaseId).set({ id: expiredLeaseId, tournamentId: runId, type: "activate_full_tournament", status: "pending", version: 1, runAt, schedulerDispatchState: "dispatching", schedulerDispatchLeaseUntilAt: new Date(Date.now() - 5_000).toISOString(), schedulerDispatchAttempts: 1, createdAt: new Date().toISOString() });
const expiredLeaseResult = await reconcileTournamentActivationOutbox(db, { scheduleActivation: async (task) => ({ taskName: "test-task/" + task.jobId }) }, new Date(), 100);
check(expiredLeaseResult.scanned >= 1, "expired dispatch leases are included in reconciliation");
equal((await db.collection("tournamentJobs").doc(expiredLeaseId).get()).data().schedulerDispatchState, "scheduled", "an expired lease can be reclaimed and scheduled");

const lifecycleTournamentId = runId + "_lifecycle";
const lifecycleNow = new Date();
const participantAId = lifecycleTournamentId + "_a";
const participantBId = lifecycleTournamentId + "_b";
await db.collection("tournaments").doc(lifecycleTournamentId).set({ id: lifecycleTournamentId, configVersion: 3, status: "active", participationMode: "individual", format: "single_elimination", submissionDurationHours: 48, votingDurationHours: 24 });
const futureMatchId = lifecycleTournamentId + "_future_match";
const futureDeadline = new Date(lifecycleNow.getTime() + 20 * 60_000).toISOString();
await db.collection("tournamentMatches").doc(futureMatchId).set({ id: futureMatchId, tournamentId: lifecycleTournamentId, roundId: lifecycleTournamentId + "_round", status: "submissions_open", participantAId, participantBId, submissionDeadlineAt: futureDeadline });
const firstReconcile = await ensureTournamentMatchLifecycleJobs(db, lifecycleTournamentId, lifecycleNow);
equal(firstReconcile.created, 1, "active match state creates a durable submission-deadline outbox job");
equal((await ensureTournamentMatchLifecycleJobs(db, lifecycleTournamentId, lifecycleNow)).created, 0, "repeated lifecycle reconciliation does not duplicate a scheduled transition");
const lifecycleOutboxJob = (await db.collection("tournamentJobs").where("tournamentId", "==", lifecycleTournamentId).get()).docs.map((doc) => doc.data()).find((job) => job.type === "process_tournament_match_lifecycle");
check(lifecycleOutboxJob?.expectedStatus === "submissions_open" && lifecycleOutboxJob?.expectedDeadlineAt === futureDeadline, "lifecycle outbox records state and deadline guards for stale-task rejection");

const dueMatchId = lifecycleTournamentId + "_due_match";
const dueRoundId = lifecycleTournamentId + "_due_round";
const dueDeadline = new Date(lifecycleNow.getTime() - 1_000).toISOString();
await db.collection("tournamentRounds").doc(dueRoundId).set({ id: dueRoundId, tournamentId: lifecycleTournamentId, status: "active" });
await db.collection("tournamentMatches").doc(dueMatchId).set({ id: dueMatchId, tournamentId: lifecycleTournamentId, roundId: dueRoundId, status: "submissions_open", participantAId, participantBId, submissionDeadlineAt: dueDeadline });
await db.collection("tournamentParticipants").doc(participantAId).set({ id: participantAId, tournamentId: lifecycleTournamentId, userId: "user_a", status: "active" });
await db.collection("tournamentParticipants").doc(participantBId).set({ id: participantBId, tournamentId: lifecycleTournamentId, userId: "user_b", status: "active" });
for (const participantId of [participantAId, participantBId]) await db.collection("tournamentSubmissions").doc(`${lifecycleTournamentId}_${dueMatchId}_${participantId}`).set({ id: `${lifecycleTournamentId}_${dueMatchId}_${participantId}`, tournamentId: lifecycleTournamentId, matchId: dueMatchId, roundId: dueRoundId, participantId, status: "approved" });
const dueJobId = lifecycleTournamentId + "_due_job_v1";
await db.collection("tournamentJobs").doc(dueJobId).set({ id: dueJobId, tournamentId: lifecycleTournamentId, matchId: dueMatchId, type: "process_tournament_match_lifecycle", transition: "submission_deadline", expectedStatus: "submissions_open", expectedDeadlineAt: dueDeadline, status: "pending", version: 1, runAt: dueDeadline, schedulerDispatchState: "pending" });
const lifecycleOutcomes = await Promise.all([
  processTournamentMatchLifecycleJobById(db, dueJobId, 1, lifecycleNow),
  processTournamentMatchLifecycleJobById(db, dueJobId, 1, lifecycleNow)
]);
check(lifecycleOutcomes.some((outcome) => outcome.code === "MATCH_LIFECYCLE_PROCESSED"), "due worker runs the shared authoritative deadline processor");
check(lifecycleOutcomes.every((outcome) => ["MATCH_LIFECYCLE_PROCESSED", "TASK_ALREADY_RUNNING", "JOB_ALREADY_PROCESSED"].includes(outcome.code)), "concurrent delivery is leased or treated as an idempotent duplicate");
equal((await db.collection("tournamentMatches").doc(dueMatchId).get()).data()?.status, "voting_open", "approved submissions open voting only after the server deadline check");
equal((await db.collection("tournamentJobs").doc(dueJobId).get()).data()?.status, "completed", "processed lifecycle job is durably completed");
const votingDeadlineJob = (await db.collection("tournamentJobs").where("tournamentId", "==", lifecycleTournamentId).get()).docs.map((doc) => doc.data()).find((job) => job.matchId === dueMatchId && job.transition === "voting_deadline");
check(votingDeadlineJob?.expectedStatus === "voting_open", "opening voting is followed by a durable voting-close job");
equal((await processTournamentMatchLifecycleJobById(db, dueJobId, 1, lifecycleNow)).code, "JOB_ALREADY_PROCESSED", "duplicate task delivery cannot process the same transition twice");
const votingOpenedAudit = await db.collection("tournamentAuditEvents").doc(`${dueMatchId}_voting_opened`).get();
check(votingOpenedAudit.exists, "concurrent duplicate deliveries preserve exactly one deterministic voting-open audit record");

const reviewMatchId = lifecycleTournamentId + "_review_match";
await db.collection("tournamentMatches").doc(reviewMatchId).set({ id: reviewMatchId, tournamentId: lifecycleTournamentId, roundId: dueRoundId, status: "submission_review", participantAId, participantBId, submissionDeadlineAt: dueDeadline });
const reviewSchedule = await ensureTournamentMatchLifecycleJobs(db, lifecycleTournamentId, lifecycleNow);
check(reviewSchedule.created >= 1, "moderation-dependent matches remain scheduled for readiness checks");
const reviewRecord = (await db.collection("tournamentJobs").where("tournamentId", "==", lifecycleTournamentId).get()).docs.map((doc) => doc.data()).find((job) => job.matchId === reviewMatchId && job.transition === "submission_deadline");
check(Date.parse(reviewRecord?.runAt) > lifecycleNow.getTime(), "pending moderation is rechecked later without shortening the submission window");
const immediateReviewRecheck = await ensureTournamentMatchLifecycleJobs(db, lifecycleTournamentId, lifecycleNow, 500, [reviewMatchId]);
check(immediateReviewRecheck.created >= 1, "moderation changes can trigger a durable immediate readiness recheck");

const staleTaskId = runId + "_lifecycle_stale_v1";
await db.collection("tournamentJobs").doc(staleTaskId).set({ id: staleTaskId, tournamentId: lifecycleTournamentId, matchId: dueMatchId, type: "process_tournament_match_lifecycle", transition: "submission_deadline", expectedStatus: "submissions_open", expectedDeadlineAt: dueDeadline, status: "pending", version: 1, runAt: dueDeadline });
equal((await processTournamentMatchLifecycleJobById(db, staleTaskId, 1, lifecycleNow)).code, "MATCH_LIFECYCLE_STATE_STALE", "stale status/deadline tasks are rejected before transition work");

const deliveryRecoveryId = runId + "_lifecycle_delivery_recovery_v1";
await db.collection("tournamentJobs").doc(deliveryRecoveryId).set({ id: deliveryRecoveryId, tournamentId: lifecycleTournamentId, matchId: dueMatchId, type: "process_tournament_match_lifecycle", transition: "submission_deadline", expectedStatus: "voting_open", expectedDeadlineAt: (await db.collection("tournamentMatches").doc(dueMatchId).get()).data()?.votingClosesAt, status: "pending", version: 1, runAt: new Date(lifecycleNow.getTime() - 20 * 60_000).toISOString(), schedulerDispatchState: "scheduled", schedulerTaskName: "expired-task", createdAt: new Date(lifecycleNow.getTime() - 30 * 60_000).toISOString() });
const recoveredOutbox = await reconcileTournamentActivationOutbox(db, emulatorScheduler, lifecycleNow, 100);
check(recoveredOutbox.recoveredDeliveries >= 1, "reconciler recovers stale accepted-but-unprocessed lifecycle deliveries");
const recoveredRecord = (await db.collection("tournamentJobs").doc(deliveryRecoveryId).get()).data();
equal(recoveredRecord?.version, 2, "recovery advances the lifecycle job version so old tasks are rejected");
equal(recoveredRecord?.schedulerDispatchState, "scheduled", "recovered task is resubmitted through the durable outbox");

console.log("PASS Cloud Tasks adapter, WIF/OIDC authorization, durable activation and match lifecycle jobs, moderation rechecks, idempotency, bounded retry, concurrency, and reconciliation: " + assertions + " assertions.");
