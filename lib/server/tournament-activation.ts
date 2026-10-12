import type { Firestore } from "firebase-admin/firestore";
import { generateTournamentBracket, seedParticipants } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentParticipantFoundation, TournamentTeamFoundation } from "@/lib/tournament-types";

const ACTIVE_PARTICIPANT_STATES = new Set(["registered", "active"]);
const ACTIVE_ACCOUNT_BLOCKS = new Set(["disabled", "suspended", "deactivated", "blocked", "deleted", "deletion_requested", "anonymized"]);

type ActivationJob = { id: string; tournamentId: string; version: number; runAt: string; status: string; type?: string };

export async function processTournamentActivationJobs(db: Firestore, now = new Date(), limit = 10) {
  const dueJobs = await db.collection("tournamentJobs")
    .where("status", "==", "pending")
    .where("runAt", "<=", now.toISOString())
    .orderBy("runAt", "asc")
    .limit(Math.max(1, Math.min(25, limit)))
    .get();
  const outcomes: Array<{ jobId: string; status: "activated" | "reopened" | "held" | "skipped"; code: string }> = [];
  for (const jobSnapshot of dueJobs.docs) {
    const job = { id: jobSnapshot.id, ...jobSnapshot.data() } as ActivationJob;
    const outcome = await processOneActivationJob(db, job, now);
    outcomes.push({ jobId: job.id, ...outcome });
  }
  return outcomes;
}

export async function processTournamentActivationJobById(db: Firestore, jobId: string, expectedVersion: number, now = new Date()) {
  if (!jobId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { status: "skipped" as const, code: "TASK_PAYLOAD_INVALID" };
  }
  const snapshot = await db.collection("tournamentJobs").doc(jobId).get();
  if (!snapshot.exists) return { status: "skipped" as const, code: "JOB_MISSING" };
  const job = { id: snapshot.id, ...snapshot.data() } as ActivationJob;
  if (job.type !== "activate_full_tournament" || Number(job.version) !== expectedVersion) {
    return { status: "skipped" as const, code: "TASK_VERSION_STALE" };
  }
  return processOneActivationJob(db, job, now);
}

async function processOneActivationJob(db: Firestore, job: ActivationJob, now: Date) {
  const jobRef = db.collection("tournamentJobs").doc(job.id);
  const tournamentRef = db.collection("tournaments").doc(job.tournamentId);
  return db.runTransaction(async (transaction) => {
    const [jobSnap, tournamentSnap] = await Promise.all([transaction.get(jobRef), transaction.get(tournamentRef)]);
    const currentJob = jobSnap.data();
    if (!jobSnap.exists || currentJob?.status !== "pending") return { status: "skipped" as const, code: "JOB_ALREADY_PROCESSED" };
    if (Number(currentJob.version) !== Number(job.version) || currentJob.tournamentId !== job.tournamentId || currentJob.type !== "activate_full_tournament") return { status: "skipped" as const, code: "TASK_VERSION_STALE" };
    const tournament = tournamentSnap.exists ? { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation : null;
    if (!tournament) {
      transaction.set(jobRef, { status: "held", reason: "TOURNAMENT_MISSING", updatedAt: now.toISOString() }, { merge: true });
      return { status: "held" as const, code: "TOURNAMENT_MISSING" };
    }
    if (Date.parse(job.runAt) > now.getTime()) return { status: "skipped" as const, code: "ACTIVATION_WINDOW_OPEN" };
    if (Number(tournament.configVersion ?? 1) < 3 || Number(tournament.activationVersion ?? 0) !== Number(job.version) || tournament.activationState !== "provisional") {
      transaction.set(jobRef, { status: "skipped", reason: "ACTIVATION_VERSION_STALE", updatedAt: now.toISOString() }, { merge: true });
      return { status: "skipped" as const, code: "ACTIVATION_VERSION_STALE" };
    }
    if (tournament.status !== "registration_open") {
      transaction.set(jobRef, { status: "skipped", reason: "TOURNAMENT_NO_LONGER_OPEN", updatedAt: now.toISOString() }, { merge: true });
      return { status: "skipped" as const, code: "TOURNAMENT_NO_LONGER_OPEN" };
    }
    if (tournament.entryType !== "free" && tournament.paymentActivationEnabled !== true) {
      transaction.set(tournamentRef, { activationState: "held", activationHoldReason: "PAID_ENTRY_ACTIVATION_DISABLED", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(jobRef, { status: "held", reason: "PAID_ENTRY_ACTIVATION_DISABLED", updatedAt: now.toISOString() }, { merge: true });
      return { status: "held" as const, code: "PAID_ENTRY_ACTIVATION_DISABLED" };
    }

    const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
    const competitorQuery = db.collection(competitorCollection).where("tournamentId", "==", job.tournamentId).limit(129);
    const existingMatchesQuery = db.collection("tournamentMatches").where("tournamentId", "==", job.tournamentId).limit(1);
    const [competitorSnapshot, existingMatches] = await Promise.all([transaction.get(competitorQuery), transaction.get(existingMatchesQuery)]);
    const candidates = competitorSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<TournamentParticipantFoundation & Partial<TournamentTeamFoundation>>;
    if (candidates.length > 128 || !existingMatches.empty) {
      transaction.set(tournamentRef, { activationState: "held", activationHoldReason: candidates.length > 128 ? "CAPACITY_RECONCILIATION_REQUIRED" : "BRACKET_ALREADY_EXISTS", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(jobRef, { status: "held", reason: candidates.length > 128 ? "CAPACITY_RECONCILIATION_REQUIRED" : "BRACKET_ALREADY_EXISTS", updatedAt: now.toISOString() }, { merge: true });
      return { status: "held" as const, code: candidates.length > 128 ? "CAPACITY_RECONCILIATION_REQUIRED" : "BRACKET_ALREADY_EXISTS" };
    }
    const entrants = candidates.filter((candidate) => tournament.participationMode === "team"
      ? String(candidate.status) === "ready" && Boolean(candidate.slotReservedAt)
      : ACTIVE_PARTICIPANT_STATES.has(String(candidate.status)));
    if (tournament.entryType !== "free") {
      const paymentIds = entrants.map((entrant) => String(entrant.entryPaymentId ?? "")).filter(Boolean);
      if (paymentIds.length !== entrants.length) {
        transaction.set(tournamentRef, { activationState: "held", activationHoldReason: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED", updatedAt: now.toISOString() }, { merge: true });
        transaction.set(jobRef, { status: "held", reason: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED", updatedAt: now.toISOString() }, { merge: true });
        return { status: "held" as const, code: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED" };
      }
      const paymentRefs = paymentIds.map((paymentId) => db.collection("tournamentEntryPayments").doc(paymentId));
      const payments = paymentRefs.length ? await transaction.getAll(...paymentRefs) : [];
      const paymentsValid = payments.every((payment, index) => {
        const record = payment.data() ?? {};
        const entrant = entrants[index];
        return payment.exists && record.status === "confirmed" && record.webhookConfirmed === true
          && record.tournamentId === job.tournamentId && record.entrantId === entrant.id;
      });
      if (!paymentsValid) {
        transaction.set(tournamentRef, { activationState: "held", activationHoldReason: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED", updatedAt: now.toISOString() }, { merge: true });
        transaction.set(jobRef, { status: "held", reason: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED", updatedAt: now.toISOString() }, { merge: true });
        return { status: "held" as const, code: "PAID_ENTRY_PAYMENT_RECONCILIATION_REQUIRED" };
      }
    }
    const entrantIds = entrants.map((entrant) => entrant.id);
    const uniqueIds = new Set(entrantIds);
    const accountIds = tournament.participationMode === "team"
      ? [...new Set(entrants.flatMap((entrant) => Array.isArray(entrant.memberUserIds) ? entrant.memberUserIds.map(String) : []))]
      : [...new Set(entrants.map((entrant) => String(entrant.userId ?? "")))].filter(Boolean);
    const accountRefs = accountIds.map((accountId) => db.collection("users").doc(accountId));
    const accountSnapshots = accountRefs.length ? await transaction.getAll(...accountRefs) : [];
    const accounts = new Map(accountSnapshots.map((account) => [account.id, account.data() ?? {}]));
    const membershipRefs = tournament.participationMode === "team" ? accountIds.map((accountId) => db.collection("tournamentTeamMemberships").doc(`${job.tournamentId}_${accountId}`)) : [];
    const membershipSnapshots = membershipRefs.length ? await transaction.getAll(...membershipRefs) : [];
    const memberships = new Map(membershipSnapshots.map((membership) => [membership.id, membership.exists ? membership.data() ?? {} : null]));
    const eligibleAccount = (accountId: string) => {
      const account = accounts.get(accountId);
      const status = String(account?.accountStatus ?? (account?.suspended ? "suspended" : "active")).toLowerCase();
      const type = String(account?.accountType ?? account?.role ?? "user").toLowerCase();
      return Boolean(account) && !account?.disabled && !account?.suspended && !ACTIVE_ACCOUNT_BLOCKS.has(status) && !["sponsor", "enterprise"].includes(type);
    };
    const invalid = entrants.filter((entrant) => {
      if (tournament.participationMode === "team") {
        const memberIds = Array.isArray(entrant.memberUserIds) ? entrant.memberUserIds.map(String) : [];
        const teamConfig = tournament.teamConfig;
        return !entrant.rosterLockedAt || !teamConfig || memberIds.length < teamConfig.minimumSize || memberIds.length > teamConfig.maximumSize || new Set(memberIds).size !== memberIds.length || memberIds.some((memberId) => !eligibleAccount(memberId) || memberships.get(`${job.tournamentId}_${memberId}`)?.teamId !== entrant.id || memberships.get(`${job.tournamentId}_${memberId}`)?.status !== "active");
      }
      return !eligibleAccount(String(entrant.userId ?? ""));
    });
    if (entrants.length !== tournament.participantCapacity || uniqueIds.size !== entrants.length || invalid.length) {
      const invalidIds = new Set(invalid.map((item) => item.id));
      invalid.forEach((entrant) => transaction.set(db.collection(competitorCollection).doc(entrant.id), { status: "withdrawn", activationEligibilityFailure: "REVALIDATION_FAILED", activationEligibilityCheckedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true }));
      const restoredCount = entrants.length - invalid.length;
      transaction.set(tournamentRef, { participantCount: restoredCount, status: "registration_open", activationState: "reopened", activationWindowEndsAt: null, activationHoldReason: null, updatedAt: now.toISOString() }, { merge: true });
      transaction.set(jobRef, { status: "reopened", reason: entrants.length !== tournament.participantCapacity ? "CAPACITY_CHANGED" : uniqueIds.size !== entrants.length ? "DUPLICATE_ENTRANT" : "ENTRANT_REVALIDATION_FAILED", invalidEntrantIds: [...invalidIds], updatedAt: now.toISOString() }, { merge: true });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${job.id}_reopened`), { id: `${job.id}_reopened`, tournamentId: job.tournamentId, actorId: "system_tournament_activation", action: "activation_reopened", createdAt: now.toISOString(), metadata: { entrantCount: entrants.length, capacity: tournament.participantCapacity, invalidEntrantIds: [...invalidIds] } });
      return { status: "reopened" as const, code: "ENTRANTS_REVALIDATED_AND_SLOT_REOPENED" };
    }

    const participants = entrants.map((entrant) => ({
      id: entrant.id,
      tournamentId: job.tournamentId,
      userId: String(entrant.userId ?? entrant.captainUserId ?? ""),
      teamId: tournament.participationMode === "team" ? entrant.id : null,
      status: "registered",
      checkInStatus: "not_required",
      seed: null,
      createdAt: String(entrant.createdAt ?? now.toISOString()),
      updatedAt: now.toISOString()
    })) as TournamentParticipantFoundation[];
    const seeded = seedParticipants(participants, "random", job.tournamentId);
    const bracket = generateTournamentBracket({ tournament, participants: seeded, existingMatches: [] });
    if (!bracket.created || bracket.matches.some((match) => match.roundNumber === 1 && (!match.participantAId || !match.participantBId))) {
      transaction.set(tournamentRef, { activationState: "held", activationHoldReason: bracket.code ?? "FULL_BRACKET_GENERATION_FAILED", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(jobRef, { status: "held", reason: bracket.code ?? "FULL_BRACKET_GENERATION_FAILED", updatedAt: now.toISOString() }, { merge: true });
      return { status: "held" as const, code: bracket.code ?? "FULL_BRACKET_GENERATION_FAILED" };
    }
    const submissionHours = Number(tournament.submissionDurationHours ?? 48);
    const submissionDeadline = new Date(now.getTime() + submissionHours * 60 * 60 * 1000).toISOString();
    bracket.rounds.forEach((round) => {
      const activeRound = round.roundNumber === 1;
      transaction.create(db.collection("tournamentRounds").doc(round.id), {
        ...round,
        status: activeRound ? "active" : "draft",
        startsAt: activeRound ? now.toISOString() : null,
        endsAt: activeRound ? submissionDeadline : null,
        votingOpensAt: null,
        votingClosesAt: null
      });
    });
    bracket.matches.forEach((match) => transaction.create(db.collection("tournamentMatches").doc(match.id), {
      ...match,
      status: match.roundNumber === 1 ? "submissions_open" : match.status,
      openedAt: match.roundNumber === 1 ? now.toISOString() : null,
      submissionsOpenedAt: match.roundNumber === 1 ? now.toISOString() : null,
      submissionDeadlineAt: match.roundNumber === 1 ? submissionDeadline : null,
      voteCountA: 0,
      voteCountB: 0,
      voteSequence: 0
    }));
    seeded.forEach((entrant) => transaction.set(db.collection(competitorCollection).doc(entrant.id), { seed: entrant.seed, status: "active", ...(tournament.participationMode === "team" ? { rosterLockedAt: entrants.find((item) => item.id === entrant.id)?.rosterLockedAt ?? now.toISOString() } : {}), updatedAt: now.toISOString() }, { merge: true }));
    transaction.set(tournamentRef, { status: "active", activationState: "activated", activationActivatedAt: now.toISOString(), activationWindowEndsAt: null, registrationLockedAt: now.toISOString(), participantCount: tournament.participantCapacity, seedsLockedAt: now.toISOString(), bracketGeneratedAt: now.toISOString(), bracketLockedAt: now.toISOString(), rosterLockedAt: tournament.participationMode === "team" ? now.toISOString() : null, currentRoundId: bracket.rounds.find((round) => round.roundNumber === 1)?.id ?? null, currentRoundNumber: 1, updatedAt: now.toISOString() }, { merge: true });
    transaction.set(jobRef, { status: "completed", completedAt: now.toISOString(), updatedAt: now.toISOString(), expectedMatchCount: bracket.expectedMatchCount }, { merge: true });
    transaction.create(db.collection("tournamentAuditEvents").doc(`${job.id}_activated`), { id: `${job.id}_activated`, tournamentId: job.tournamentId, actorId: "system_tournament_activation", action: "full_tournament_activated", createdAt: now.toISOString(), metadata: { participantCount: tournament.participantCapacity, format: tournament.format, activationVersion: job.version, bracketMatchCount: bracket.expectedMatchCount } });
    return { status: "activated" as const, code: "FULL_BRACKET_ACTIVATED" };
  });
}
