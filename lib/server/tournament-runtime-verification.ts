import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { createGoogleCloudTasksScheduler, type TournamentTaskScheduler } from "@/lib/server/tournament-cloud-tasks";

// This module deliberately never imports competition, registration or finance
// services. Every Firestore reference is one exact reserved synthetic document.
const collection = "tournamentRuntimeVerification";
const prefix = "release-probe_";
const pattern = /^release-probe_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isTournamentVerificationJob(value: string) { return value.startsWith(prefix); }
export function validTournamentVerificationJob(value: string) { return pattern.test(value); }

export async function createTournamentVerification(db: Firestore, actorId: string, reason: string, retryOnce = false) {
  if (!actorId || reason.trim().length < 10 || reason.length > 500) throw new Error("VERIFICATION_REASON_REQUIRED");
  const id = prefix + randomUUID(), now = Date.now();
  await db.collection(collection).doc(id).create({ synthetic: true, actorId, reason, createdAt: new Date(now).toISOString(), expiresAt: now + 30 * 60_000, version: 1, attempts: 0, retryFailuresRemaining: retryOnce ? 1 : 0, transitions: 0, dispatches: 0, state: "pending", runAt: now + 5_000 });
  return { id };
}

export async function readTournamentVerification(db: Firestore, id: string) {
  if (!validTournamentVerificationJob(id)) throw new Error("VERIFICATION_ID_INVALID");
  const data = (await db.collection(collection).doc(id).get()).data();
  if (!data || data.synthetic !== true) return null;
  return data;
}

export async function dispatchTournamentVerification(db: Firestore, id: string, scheduler: TournamentTaskScheduler | null = createGoogleCloudTasksScheduler()) {
  if (!validTournamentVerificationJob(id) || !scheduler) throw new Error("VERIFICATION_CONFIGURATION_INVALID");
  const ref = db.collection(collection).doc(id);
  const task = await db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record || record.synthetic !== true || record.expiresAt <= Date.now() || record.state !== "pending" || record.dispatches >= 4) throw new Error("VERIFICATION_NOT_DISPATCHABLE");
    tx.update(ref, { dispatches: record.dispatches + 1 });
    return { jobId: id, version: record.version, runAt: new Date(record.runAt).toISOString() };
  });
  // On a failed enqueue the bounded exact-document dispatch may be retried.
  const result = await scheduler.scheduleActivation(task);
  await ref.update({ taskName: result.taskName });
  return result;
}

export async function processTournamentVerification(db: Firestore, id: string, version: number, now = Date.now()) {
  if (!validTournamentVerificationJob(id) || !Number.isSafeInteger(version) || version < 1) return { code: "VERIFICATION_INVALID", retry: false };
  const ref = db.collection(collection).doc(id);
  return db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record || record.synthetic !== true || record.expiresAt <= now) return { code: "VERIFICATION_EXPIRED_OR_MISSING", retry: false };
    if (record.version !== version) return { code: "VERIFICATION_STALE", retry: false };
    if (record.state === "completed") return { code: "VERIFICATION_DUPLICATE", retry: false };
    if (record.runAt > now) return { code: "VERIFICATION_NOT_DUE", retry: true };
    if (record.retryFailuresRemaining === 1) {
      tx.update(ref, { attempts: record.attempts + 1, retryFailuresRemaining: 0 });
      return { code: "VERIFICATION_RETRY_ONCE", retry: true };
    }
    tx.update(ref, { attempts: record.attempts + 1, transitions: 1, state: "completed", completedAt: new Date(now).toISOString() });
    return { code: "VERIFICATION_COMPLETED", retry: false };
  });
}

// Recovery operates on one explicit synthetic document; no outbox scan or
// readiness write is permitted. Its task ID differs from the worker task ID.
export async function recoverTournamentVerification(db: Firestore, id: string, version: number, scheduler: TournamentTaskScheduler | null = createGoogleCloudTasksScheduler()) {
  const record = await readTournamentVerification(db, id);
  if (!record || record.version !== version || record.expiresAt <= Date.now()) return { code: "VERIFICATION_STALE_OR_MISSING" };
  if (record.state === "completed") return { code: "VERIFICATION_ALREADY_COMPLETED" };
  return dispatchTournamentVerification(db, id, scheduler);
}

export async function scheduleTournamentVerificationRecovery(db: Firestore, id: string) {
  const record = await readTournamentVerification(db, id);
  if (!record || record.state !== "pending" || record.expiresAt <= Date.now()) throw new Error("VERIFICATION_NOT_DISPATCHABLE");
  const audience = process.env.TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE;
  if (!audience || audience !== "https://www.challengesuite.com/api/internal/tournament-scheduler") throw new Error("VERIFICATION_RECOVERY_TARGET_INVALID");
  const scheduler = createGoogleCloudTasksScheduler({ env: { ...process.env, TOURNAMENT_CLOUD_TASKS_WORKER_URL: audience, TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE: audience } });
  if (!scheduler) throw new Error("VERIFICATION_CONFIGURATION_INVALID");
  return scheduler.scheduleActivation({ jobId: id + "_reconcile", version: record.version, runAt: new Date(record.runAt).toISOString() });
}

export async function cleanupTournamentVerification(db: Firestore, id: string) {
  if (!validTournamentVerificationJob(id)) throw new Error("VERIFICATION_ID_INVALID");
  const ref = db.collection(collection).doc(id);
  await db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record) return;
    if (record.synthetic !== true) throw new Error("VERIFICATION_SCOPE_INVALID");
    tx.delete(ref);
  });
  return { deleted: true };
}
