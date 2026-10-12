import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createGoogleCloudTasksScheduler, dispatchTournamentActivationOutbox, isTournamentV3SchedulingReady, reconcileTournamentActivationOutbox, verifyTournamentCloudTaskRequest } from "../lib/server/tournament-cloud-tasks.ts";

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

console.log("PASS Cloud Tasks adapter, WIF/OIDC authorization, idempotent Firestore outbox, bounded retry, concurrency, and reconciliation: " + assertions + " assertions.");
