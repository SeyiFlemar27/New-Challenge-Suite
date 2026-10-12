import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { processTournamentLifecycleAction } from "@/lib/server/tournament-lifecycle-scheduler";
import { createGoogleCloudTasksScheduler, reconcileTournamentActivationOutbox } from "@/lib/server/tournament-cloud-tasks";

const REVIEW_RECHECK_MS = 5 * 60_000;
const TERMINAL_MATCH_STATES = new Set(["confirmed", "forfeit", "bye", "completed", "held", "double_forfeit_hold"]);

type LifecycleMatch = {
  id: string;
  tournamentId?: string;
  status?: string;
  submissionDeadlineAt?: string | null;
  votingClosesAt?: string | null;
  nextLifecycleCheckAt?: string | null;
};

function lifecycleJobId(matchId: string, status: string, deadlineAt: string, runAt: string) {
  const digest = createHash("sha256").update(`${matchId}|${status}|${deadlineAt}|${runAt}`).digest("hex").slice(0, 32);
  return `match_lifecycle_${digest}`;
}

function isoOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

/**
 * Reconciles durable jobs from authoritative active match state. This is safe to
 * call repeatedly: deterministic job IDs, transactional state rechecks, and
 * persisted review polling times prevent duplicate schedules.
 */
export async function ensureTournamentMatchLifecycleJobs(db: Firestore, tournamentId: string, now = new Date(), limit = 500, immediateMatchIds: string[] = []) {
  const tournamentSnapshot = await db.collection("tournaments").doc(tournamentId).get();
  if (!tournamentSnapshot.exists || Number(tournamentSnapshot.data()?.configVersion ?? 1) < 3
      || !["active", "round_active", "under_review"].includes(String(tournamentSnapshot.data()?.status ?? ""))) {
    return { scanned: 0, created: 0, skipped: 0, reason: "TOURNAMENT_NOT_SCHEDULABLE" };
  }
  const matchesSnapshot = await db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(Math.max(1, Math.min(500, limit))).get();
  let created = 0;
  let skipped = 0;
  for (const snapshot of matchesSnapshot.docs) {
    const match = { id: snapshot.id, ...snapshot.data() } as LifecycleMatch;
    const status = String(match.status ?? "");
    if (TERMINAL_MATCH_STATES.has(status)) { skipped += 1; continue; }
    const isSubmission = ["submissions_open", "submission_review"].includes(status);
    const isVoting = status === "voting_open";
    if (!isSubmission && !isVoting) { skipped += 1; continue; }
    const deadlineAt = isoOrNull(isSubmission ? match.submissionDeadlineAt : match.votingClosesAt);
    if (!deadlineAt) { skipped += 1; continue; }
    const matchRef = snapshot.ref;
    const matchJob = await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(matchRef);
      if (!currentSnapshot.exists) return null;
      const current = { id: currentSnapshot.id, ...currentSnapshot.data() } as LifecycleMatch;
      if (current.tournamentId !== tournamentId || current.status !== status) return null;
      const currentDeadline = isoOrNull(isSubmission ? current.submissionDeadlineAt : current.votingClosesAt);
      if (currentDeadline !== deadlineAt) return null;
      let runAt = deadlineAt;
      let persistNextCheckAt: string | null = null;
      if (status === "submission_review" && Date.parse(deadlineAt) <= now.getTime()) {
        const existingCheck = isoOrNull(current.nextLifecycleCheckAt);
        if (immediateMatchIds.includes(match.id)) runAt = now.toISOString();
        else if (existingCheck && Date.parse(existingCheck) > now.getTime()) runAt = existingCheck;
        else {
          runAt = new Date(now.getTime() + REVIEW_RECHECK_MS).toISOString();
          persistNextCheckAt = runAt;
        }
      }
      const jobId = lifecycleJobId(match.id, status, deadlineAt, runAt);
      const jobRef = db.collection("tournamentJobs").doc(jobId);
      const existingJob = await transaction.get(jobRef);
      if (existingJob.exists) return { jobId, created: false };
      if (persistNextCheckAt) transaction.set(matchRef, { nextLifecycleCheckAt: persistNextCheckAt, updatedAt: now.toISOString() }, { merge: true });
      transaction.create(jobRef, {
        id: jobId,
        tournamentId,
        matchId: match.id,
        type: "process_tournament_match_lifecycle",
        transition: isSubmission ? "submission_deadline" : "voting_deadline",
        expectedStatus: status,
        expectedDeadlineAt: deadlineAt,
        status: "pending",
        version: 1,
        runAt,
        schedulerDispatchState: "pending",
        schedulerDispatchAttempts: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
      return { jobId, created: true };
    });
    if (matchJob?.created) created += 1;
    else skipped += 1;
  }
  return { scanned: matchesSnapshot.size, created, skipped, reason: null };
}

export async function reconcileActiveTournamentMatchLifecycleJobs(db: Firestore, now = new Date(), limit = 100) {
  const boundedLimit = Math.max(1, Math.min(250, limit));
  const tournaments = await db.collection("tournaments").where("status", "in", ["active", "round_active", "under_review"]).limit(boundedLimit).get();
  let scannedMatches = 0;
  let createdJobs = 0;
  let skippedMatches = 0;
  let eligibleTournaments = 0;
  for (const snapshot of tournaments.docs) {
    if (Number(snapshot.data().configVersion ?? 1) < 3) continue;
    eligibleTournaments += 1;
    const result = await ensureTournamentMatchLifecycleJobs(db, snapshot.id, now);
    scannedMatches += result.scanned;
    createdJobs += result.created;
    skippedMatches += result.skipped;
  }
  return { scannedTournaments: tournaments.size, eligibleTournaments, scannedMatches, createdJobs, skippedMatches };
}

export async function reconcileTournamentLifecycleAfterStateChange(db: Firestore, tournamentId: string, now = new Date(), immediateMatchIds: string[] = []) {
  const lifecycle = await ensureTournamentMatchLifecycleJobs(db, tournamentId, now, 500, immediateMatchIds);
  let scheduler: ReturnType<typeof createGoogleCloudTasksScheduler>;
  try { scheduler = createGoogleCloudTasksScheduler(); }
  catch { return { lifecycle, dispatch: { configured: false, error: "CLOUD_TASKS_CONFIGURATION_INVALID" } }; }
  const dispatch = await reconcileTournamentActivationOutbox(db, scheduler, now);
  return { lifecycle, dispatch };
}

export async function processTournamentMatchLifecycleJobById(db: Firestore, jobId: string, expectedVersion: number, now = new Date()) {
  if (!jobId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { status: "skipped" as const, code: "TASK_PAYLOAD_INVALID" };
  const jobRef = db.collection("tournamentJobs").doc(jobId);
  const claim = await db.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobRef);
    const job = jobSnapshot.data() ?? {};
    if (!jobSnapshot.exists) return { status: "skipped" as const, code: "JOB_MISSING" };
    if (job.type !== "process_tournament_match_lifecycle" || Number(job.version) !== expectedVersion) return { status: "skipped" as const, code: "TASK_VERSION_STALE" };
    if (job.status !== "pending") return { status: "skipped" as const, code: "JOB_ALREADY_PROCESSED" };
    if (Date.parse(String(job.runAt ?? "")) > now.getTime()) return { status: "not_due" as const, code: "TASK_NOT_DUE" };
    const matchRef = db.collection("tournamentMatches").doc(String(job.matchId ?? ""));
    const matchSnapshot = await transaction.get(matchRef);
    const match = matchSnapshot.data() ?? {};
    const deadlineField = job.transition === "voting_deadline" ? "votingClosesAt" : "submissionDeadlineAt";
    if (!matchSnapshot.exists || match.tournamentId !== job.tournamentId || match.status !== job.expectedStatus
        || isoOrNull(match[deadlineField]) !== isoOrNull(job.expectedDeadlineAt)) {
      transaction.set(jobRef, { status: "skipped", reason: "MATCH_LIFECYCLE_STATE_STALE", completedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      return { status: "skipped" as const, code: "MATCH_LIFECYCLE_STATE_STALE" };
    }
    const leaseUntil = isoOrNull(job.executionLeaseUntilAt);
    if (leaseUntil && Date.parse(leaseUntil) > now.getTime()) return { status: "running" as const, code: "TASK_ALREADY_RUNNING" };
    transaction.set(jobRef, { executionLeaseUntilAt: new Date(now.getTime() + 2 * 60_000).toISOString(), executionStartedAt: now.toISOString(), executionAttempts: Number(job.executionAttempts ?? 0) + 1, updatedAt: now.toISOString() }, { merge: true });
    return { status: "claimed" as const, tournamentId: String(job.tournamentId), matchId: String(job.matchId) };
  });
  if (claim.status !== "claimed") return claim;

  try {
    const tournamentSnapshot = await db.collection("tournaments").doc(claim.tournamentId).get();
    if (!tournamentSnapshot.exists) {
      await jobRef.set({ status: "held", reason: "TOURNAMENT_MISSING", executionLeaseUntilAt: null, updatedAt: now.toISOString() }, { merge: true });
      return { status: "held" as const, code: "TOURNAMENT_MISSING" };
    }
    const response = await processTournamentLifecycleAction({
      db,
      id: claim.tournamentId,
      tournament: { id: tournamentSnapshot.id, ...tournamentSnapshot.data() } as never,
      action: "process_match_deadlines",
      actorId: "system_tournament_lifecycle",
      now
    });
    if (!response.ok) throw new Error("TOURNAMENT_LIFECYCLE_PROCESSING_FAILED");
    const currentMatchSnapshot = await db.collection("tournamentMatches").doc(claim.matchId).get();
    const currentMatch = currentMatchSnapshot.data() ?? {};
    await db.runTransaction(async (transaction) => {
      const currentJobSnapshot = await transaction.get(jobRef);
      const currentJob = currentJobSnapshot.data() ?? {};
      if (!currentJobSnapshot.exists || Number(currentJob.version) !== expectedVersion || currentJob.status !== "pending") return;
      transaction.set(jobRef, { status: "completed", completedAt: now.toISOString(), executionLeaseUntilAt: null, updatedAt: now.toISOString() }, { merge: true });
      if (currentMatch.status === "submission_review" && Date.parse(String(currentMatch.submissionDeadlineAt ?? "")) <= now.getTime()) {
        const nextCheckAt = isoOrNull(currentMatch.nextLifecycleCheckAt);
        if (!nextCheckAt || Date.parse(nextCheckAt) <= now.getTime()) {
          transaction.set(currentMatchSnapshot.ref, { nextLifecycleCheckAt: new Date(now.getTime() + REVIEW_RECHECK_MS).toISOString(), updatedAt: now.toISOString() }, { merge: true });
        }
      }
    });
    await ensureTournamentMatchLifecycleJobs(db, claim.tournamentId, now);
    return { status: "completed" as const, code: "MATCH_LIFECYCLE_PROCESSED" };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "TOURNAMENT_LIFECYCLE_PROCESSING_FAILED";
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(jobRef);
      if (!current.exists || Number(current.data()?.version) !== expectedVersion || current.data()?.status !== "pending") return;
      transaction.set(jobRef, { executionLeaseUntilAt: null, executionLastErrorCode: code, executionLastFailureAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    });
    throw error;
  }
}

export async function processTournamentMatchLifecycleJobs(db: Firestore, now = new Date(), limit = 25) {
  const dueJobs = await db.collection("tournamentJobs")
    .where("status", "==", "pending")
    .where("type", "==", "process_tournament_match_lifecycle")
    .where("runAt", "<=", now.toISOString())
    .orderBy("runAt", "asc")
    .limit(Math.max(1, Math.min(100, limit)))
    .get();
  const outcomes = [];
  for (const snapshot of dueJobs.docs) {
    try {
      outcomes.push({ jobId: snapshot.id, ...(await processTournamentMatchLifecycleJobById(db, snapshot.id, Number(snapshot.data().version), now)) });
    } catch {
      outcomes.push({ jobId: snapshot.id, status: "retrying" as const, code: "MATCH_LIFECYCLE_PROCESSING_FAILED" });
    }
  }
  return outcomes;
}
