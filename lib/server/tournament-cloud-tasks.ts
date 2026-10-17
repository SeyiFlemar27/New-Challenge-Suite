import { createHash } from "node:crypto";
import { ExternalAccountClient, OAuth2Client } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import type { Firestore } from "firebase-admin/firestore";

const MAX_RECONCILE_SCAN = 500;
const DISPATCH_LEASE_MS = 60_000;
const SCHEDULABLE_TOURNAMENT_JOB_TYPES = ["activate_full_tournament", "process_tournament_match_lifecycle", "expire_team_registration"] as const;

export type TournamentActivationTask = { jobId: string; version: number; runAt: string };
export type TournamentTaskScheduler = { scheduleActivation(task: TournamentActivationTask): Promise<{ taskName: string }>; verifyDispatchAccess?(): Promise<boolean> };

type CloudTasksConfig = {
  projectId: string;
  location: string;
  queue: string;
  workerUrl: string;
  projectNumber: string;
  workloadIdentityPoolId: string;
  workloadIdentityProviderId: string;
  enqueuerServiceAccountEmail: string;
  invokerServiceAccountEmail: string;
  audience: string;
};

function readConfig(env: NodeJS.ProcessEnv = process.env): CloudTasksConfig | null {
  const fields = [
    env.GOOGLE_CLOUD_PROJECT,
    env.CLOUD_TASKS_LOCATION,
    env.TOURNAMENT_CLOUD_TASKS_QUEUE,
    env.TOURNAMENT_CLOUD_TASKS_WORKER_URL,
    env.GOOGLE_CLOUD_PROJECT_NUMBER,
    env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID,
    env.GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    env.TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT,
    env.TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT
  ];
  if (fields.every((value) => !value)) return null;
  if (fields.some((value) => !value?.trim())) throw new Error("Tournament Cloud Tasks configuration is incomplete.");

  const workerUrl = new URL(env.TOURNAMENT_CLOUD_TASKS_WORKER_URL!);
  if (workerUrl.protocol !== "https:" || workerUrl.username || workerUrl.password || workerUrl.search || workerUrl.hash) {
    throw new Error("Tournament Cloud Tasks worker URL must be a clean HTTPS endpoint.");
  }
  const enqueuerServiceAccountEmail = env.TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT!.trim().toLowerCase();
  const invokerServiceAccountEmail = env.TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT!.trim().toLowerCase();
  const serviceAccountPattern = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/;
  if (!serviceAccountPattern.test(enqueuerServiceAccountEmail) || !serviceAccountPattern.test(invokerServiceAccountEmail)) throw new Error("Tournament Cloud Tasks service-account configuration is invalid.");
  const projectId = env.GOOGLE_CLOUD_PROJECT!.trim();
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error("Tournament Cloud Tasks project ID is invalid.");
  if (!enqueuerServiceAccountEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`) || !invokerServiceAccountEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`)) throw new Error("Tournament Cloud Tasks service accounts must belong to the configured queue project.");
  const projectNumber = env.GOOGLE_CLOUD_PROJECT_NUMBER!.trim();
  if (!/^\d{6,20}$/.test(projectNumber)) throw new Error("Tournament Cloud Tasks project number is invalid.");
  const workloadIdentityPoolId = env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID!.trim();
  const workloadIdentityProviderId = env.GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!.trim();
  if (!/^[a-z0-9-]{4,32}$/.test(workloadIdentityPoolId) || !/^[a-z0-9-]{4,32}$/.test(workloadIdentityProviderId)) throw new Error("Tournament Cloud Tasks Workload Identity Federation configuration is invalid.");
  const location = env.CLOUD_TASKS_LOCATION!.trim();
  const queue = env.TOURNAMENT_CLOUD_TASKS_QUEUE!.trim();
  if (!/^[a-z0-9-]+$/.test(location) || !/^[a-zA-Z0-9_-]+$/.test(queue)) throw new Error("Tournament Cloud Tasks queue configuration is invalid.");

  return {
    projectId,
    location,
    queue,
    workerUrl: workerUrl.toString(),
    projectNumber,
    workloadIdentityPoolId,
    workloadIdentityProviderId,
    enqueuerServiceAccountEmail,
    invokerServiceAccountEmail,
    audience: (env.TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE || workerUrl.toString()).trim()
  };
}

function taskId(jobId: string, version: number) {
  return `tournament-${createHash("sha256").update(`${jobId}:${version}`).digest("hex").slice(0, 48)}`;
}

export function createGoogleCloudTasksScheduler(options?: {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string>;
}): TournamentTaskScheduler | null {
  const config = readConfig(options?.env);
  if (!config) return null;
  const fetcher = options?.fetcher ?? fetch;
  let authClient: ReturnType<typeof ExternalAccountClient.fromJSON> | undefined;
  const getAccessToken = options?.getAccessToken ?? (async () => {
    if (authClient === undefined) {
      const audience = "//iam.googleapis.com/projects/" + config.projectNumber + "/locations/global/workloadIdentityPools/" + config.workloadIdentityPoolId + "/providers/" + config.workloadIdentityProviderId;
      const serviceAccountImpersonationUrl = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + encodeURIComponent(config.enqueuerServiceAccountEmail) + ":generateAccessToken";
      authClient = ExternalAccountClient.fromJSON({
        type: "external_account",
        audience,
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        token_url: "https://sts.googleapis.com/v1/token",
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        service_account_impersonation_url: serviceAccountImpersonationUrl,
        subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() }
      });
    }
    if (!authClient) throw new Error("Google Workload Identity Federation configuration could not be initialized.");
    const result = await authClient.getAccessToken();
    if (!result.token) throw new Error("Google Cloud credentials did not provide an access token.");
    return result.token;
  });

  return {
    async verifyDispatchAccess() {
      const queuePath = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
      const response = await fetcher(`https://cloudtasks.googleapis.com/v2/${queuePath}:testIamPermissions`, { method: "POST", headers: { authorization: `Bearer ${await getAccessToken()}`, "content-type": "application/json" }, body: JSON.stringify({ permissions: ["cloudtasks.tasks.create"] }) });
      if (!response.ok) return false;
      const result = await response.json() as { permissions?: string[] };
      return result.permissions?.includes("cloudtasks.tasks.create") === true;
    },
    async scheduleActivation(task) {
      const runAt = Date.parse(task.runAt);
      if (!task.jobId || !Number.isSafeInteger(task.version) || !Number.isFinite(runAt)) throw new Error("Tournament activation task payload is invalid.");
      const queuePath = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
      const name = `${queuePath}/tasks/${taskId(task.jobId, task.version)}`;
      const endpoint = `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`;
      const payload = Buffer.from(JSON.stringify({ jobId: task.jobId, version: task.version }), "utf8").toString("base64");
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${await getAccessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({
          task: {
            name,
            scheduleTime: new Date(runAt).toISOString(),
            httpRequest: {
              httpMethod: "POST",
              url: config.workerUrl,
              headers: { "content-type": "application/json" },
              body: payload,
              oidcToken: { serviceAccountEmail: config.invokerServiceAccountEmail, audience: config.audience }
            }
          }
        })
      });
      if (response.status === 409) return { taskName: name };
      if (!response.ok) throw Object.assign(new Error("Google Cloud Tasks rejected the activation task."), { code: `CLOUD_TASKS_HTTP_${response.status}` });
      return { taskName: name };
    }
  };
}

export function isTournamentCloudTasksConfigured(env: NodeJS.ProcessEnv = process.env) {
  try { return readConfig(env) !== null; }
  catch { return false; }
}

export function isTournamentV3SchedulingReady(env: NodeJS.ProcessEnv = process.env) {
  return isTournamentCloudTasksConfigured(env)
    && env.TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED === "true"
    && env.TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED === "true"
    && Boolean(env.TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE?.trim());
}

let verifier: OAuth2Client | undefined;

export async function verifyTournamentCloudTaskRequest(request: Request, options?: {
  env?: NodeJS.ProcessEnv;
  expectedAudience?: string;
  verifyToken?: (token: string, audience: string) => Promise<Record<string, unknown> | undefined>;
}): Promise<boolean> {
  let config: CloudTasksConfig | null;
  try { config = readConfig(options?.env); } catch { return false; }
  if (!config) return false;
  const expectedAudience = options?.expectedAudience?.trim() || config.audience;
  if (!expectedAudience) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return false;
  try {
    const claims = options?.verifyToken
      ? await options.verifyToken(match[1], expectedAudience)
      : await (async () => {
        verifier ??= new OAuth2Client();
        const ticket = await verifier.verifyIdToken({ idToken: match[1], audience: expectedAudience });
        return ticket.getPayload() as Record<string, unknown> | undefined;
      })();
    const issuer = claims?.iss;
    const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
    return Boolean(claims && (issuer === "https://accounts.google.com" || issuer === "accounts.google.com")
      && claims.aud === expectedAudience && claims.email_verified === true && email === config.invokerServiceAccountEmail);
  } catch {
    return false;
  }
}

export async function dispatchTournamentActivationOutbox(db: Firestore, jobId: string, scheduler?: TournamentTaskScheduler | null, now = new Date()) {
  if (scheduler === undefined) {
    try { scheduler = createGoogleCloudTasksScheduler(); } catch { return { status: "pending" as const, reason: "CLOUD_TASKS_CONFIGURATION_INVALID" }; }
  }
  if (!scheduler) return { status: "unconfigured" as const };
  const jobRef = db.collection("tournamentJobs").doc(jobId);
  const nowIso = now.toISOString();
  const leaseId = createHash("sha256").update(`${jobId}:${nowIso}:${Math.random()}`).digest("hex");
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists) return { allowed: false as const, code: "JOB_MISSING" };
    const job = snapshot.data() ?? {};
    if (!SCHEDULABLE_TOURNAMENT_JOB_TYPES.includes(job.type as typeof SCHEDULABLE_TOURNAMENT_JOB_TYPES[number])) return { allowed: false as const, code: "JOB_TYPE_UNSUPPORTED" };
    if (job.status !== "pending") return { allowed: false as const, code: "JOB_NOT_PENDING" };
    if (job.schedulerDispatchState === "scheduled") return { allowed: false as const, code: "ALREADY_SCHEDULED" };
    const retryAt = Date.parse(String(job.schedulerRetryAt ?? ""));
    if (Number.isFinite(retryAt) && retryAt > now.getTime()) return { allowed: false as const, code: "RETRY_BACKOFF" };
    const leaseUntil = Date.parse(String(job.schedulerDispatchLeaseUntilAt ?? ""));
    if (job.schedulerDispatchState === "dispatching" && Number.isFinite(leaseUntil) && leaseUntil > now.getTime()) return { allowed: false as const, code: "DISPATCH_IN_PROGRESS" };
    transaction.set(jobRef, {
      schedulerDispatchState: "dispatching",
      schedulerDispatchLeaseId: leaseId,
      schedulerDispatchLeaseUntilAt: new Date(now.getTime() + DISPATCH_LEASE_MS).toISOString(),
      schedulerDispatchAttempts: Number(job.schedulerDispatchAttempts ?? 0) + 1,
      updatedAt: nowIso
    }, { merge: true });
    return { allowed: true as const, version: Number(job.version), runAt: String(job.runAt ?? "") };
  });
  if (!claim.allowed) return { status: claim.code === "ALREADY_SCHEDULED" ? "scheduled" as const : "pending" as const, reason: claim.code };

  try {
    const scheduled = await scheduler.scheduleActivation({ jobId, version: claim.version, runAt: claim.runAt });
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      const job = snapshot.data() ?? {};
      if (!snapshot.exists || job.schedulerDispatchLeaseId !== leaseId || job.status !== "pending") return;
      const updatedAt = new Date().toISOString();
      transaction.set(jobRef, { schedulerDispatchState: "scheduled", schedulerTaskName: scheduled.taskName, schedulerDispatchedAt: updatedAt, schedulerDispatchLeaseId: null, schedulerDispatchLeaseUntilAt: null, schedulerRetryAt: null, schedulerLastErrorCode: null, updatedAt }, { merge: true });
    });
    return { status: "scheduled" as const, taskName: scheduled.taskName };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 80) : "CLOUD_TASKS_DISPATCH_FAILED";
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      const job = snapshot.data() ?? {};
      if (!snapshot.exists || job.schedulerDispatchLeaseId !== leaseId || job.status !== "pending") return;
      const attempts = Math.max(1, Number(job.schedulerDispatchAttempts ?? 1));
      const backoffMs = Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempts, 9));
      const failedAt = new Date().toISOString();
      transaction.set(jobRef, { schedulerDispatchState: "pending", schedulerDispatchLeaseId: null, schedulerDispatchLeaseUntilAt: null, schedulerRetryAt: new Date(now.getTime() + backoffMs).toISOString(), schedulerLastErrorCode: code, schedulerLastFailureAt: failedAt, updatedAt: failedAt }, { merge: true });
    });
    return { status: "pending" as const, reason: code };
  }
}

export async function reconcileTournamentActivationOutbox(db: Firestore, scheduler?: TournamentTaskScheduler | null, now = new Date(), limit = 100) {
  if (scheduler === undefined) {
    try { scheduler = createGoogleCloudTasksScheduler(); } catch { return { scanned: 0, attempted: 0, scheduled: 0, pending: 0, configured: false, error: "CLOUD_TASKS_CONFIGURATION_INVALID" }; }
  }
  if (!scheduler) return { scanned: 0, attempted: 0, scheduled: 0, pending: 0, configured: false };
  const boundedLimit = Math.max(1, Math.min(MAX_RECONCILE_SCAN, limit));
  const jobs = db.collection("tournamentJobs");
  const staleDeliveryCutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
  const staleLifecycleTasks = await jobs.where("status", "==", "pending")
    .where("type", "==", "process_tournament_match_lifecycle")
    .where("schedulerDispatchState", "==", "scheduled")
    .where("runAt", "<=", staleDeliveryCutoff)
    .orderBy("runAt", "asc").limit(boundedLimit).get();
  let recoveredDeliveries = 0;
  for (const candidate of staleLifecycleTasks.docs) {
    const recovered = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      const job = current.data() ?? {};
      if (!current.exists || job.status !== "pending" || job.type !== "process_tournament_match_lifecycle" || job.schedulerDispatchState !== "scheduled") return false;
      const leaseUntil = Date.parse(String(job.executionLeaseUntilAt ?? ""));
      if (Number.isFinite(leaseUntil) && leaseUntil > now.getTime()) return false;
      if (Date.parse(String(job.runAt ?? "")) > now.getTime() - 15 * 60_000) return false;
      transaction.set(candidate.ref, {
        version: Number(job.version ?? 0) + 1,
        runAt: now.toISOString(),
        schedulerDispatchState: "pending",
        schedulerRetryAt: now.toISOString(),
        schedulerPreviousTaskName: job.schedulerTaskName ?? null,
        schedulerTaskName: null,
        schedulerLastErrorCode: "LIFECYCLE_TASK_DELIVERY_RECONCILED",
        schedulerRecoveredAt: now.toISOString(),
        executionLeaseUntilAt: null,
        updatedAt: now.toISOString()
      }, { merge: true });
      return true;
    });
    if (recovered) recoveredDeliveries += 1;
  }
  const [pendingDispatch, expiredLease] = await Promise.all([
    jobs.where("status", "==", "pending").where("type", "in", [...SCHEDULABLE_TOURNAMENT_JOB_TYPES]).where("schedulerDispatchState", "==", "pending").orderBy("createdAt", "asc").limit(boundedLimit).get(),
    jobs.where("status", "==", "pending").where("type", "in", [...SCHEDULABLE_TOURNAMENT_JOB_TYPES]).where("schedulerDispatchState", "==", "dispatching").where("schedulerDispatchLeaseUntilAt", "<=", now.toISOString()).orderBy("schedulerDispatchLeaseUntilAt", "asc").limit(boundedLimit).get()
  ]);
  const candidates = new Map([...pendingDispatch.docs, ...expiredLease.docs].map((snapshot) => [snapshot.id, snapshot]));
  let attempted = 0;
  let scheduled = 0;
  let pending = 0;
  for (const snapshot of [...candidates.values()].slice(0, boundedLimit)) {
    const job = snapshot.data() ?? {};
    const retryAt = Date.parse(String(job.schedulerRetryAt ?? ""));
    if (Number.isFinite(retryAt) && retryAt > now.getTime()) { pending += 1; continue; }
    attempted += 1;
    const result = await dispatchTournamentActivationOutbox(db, snapshot.id, scheduler, now);
    if (result.status === "scheduled") scheduled += 1;
    else if (result.status === "pending") pending += 1;
  }
  return { scanned: candidates.size + staleLifecycleTasks.size, attempted, scheduled, pending, recoveredDeliveries, configured: true };
}
