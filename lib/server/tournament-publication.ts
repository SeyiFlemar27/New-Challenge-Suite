import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { isTournamentV3SchedulingReady, type TournamentTaskScheduler } from "@/lib/server/tournament-cloud-tasks";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";
import { readPublicationSafety } from "@/lib/server/publication-guards";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
let testReadiness: boolean | null = null;

/** An empty outbox is not evidence that the runtime can enqueue a task. */
export async function recordTournamentSchedulerReadiness(db: Firestore, scheduler: TournamentTaskScheduler, dispatch: { configured: boolean; pending: number }) {
  let dispatchVerified = false;
  try { dispatchVerified = await scheduler.verifyDispatchAccess?.() === true; } catch { /* fail closed */ }
  const healthy = dispatchVerified && dispatch.configured && dispatch.pending === 0;
  const checkedAt = new Date().toISOString();
  await db.collection("operationalReadiness").doc("tournament_scheduler").set({
    status: healthy ? "verified" : "unavailable", checkedAt,
    ...(healthy ? { verifiedAt: checkedAt } : {}),
    evidence: healthy ? "authenticated_reconciler_and_dispatch_permission" : "scheduler_dispatch_not_verified"
  }, { merge: true });
  return healthy;
}
/** Deterministic dependency seam; inaccessible outside isolated local test infrastructure. */
export function setTournamentRegistrationReadinessForTests(value: boolean | null) {
  if (process.env.NODE_ENV === "production" || !String(process.env.GCLOUD_PROJECT).startsWith("demo-") || ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"].some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] ?? ""))) throw new Error("ISOLATED_EMULATOR_REQUIRED");
  testReadiness = value;
}

/** Config alone is not proof. A successful authenticated scheduler invocation supplies recent health evidence. */
export async function tournamentRegistrationReady(db: Firestore, now = Date.now()) {
  if (testReadiness !== null) return testReadiness;
  if (!isTournamentV3SchedulingReady()) return false;
  const health = await db.collection("operationalReadiness").doc("tournament_scheduler").get();
  const checked = Date.parse(String(health.data()?.verifiedAt ?? ""));
  return health.data()?.status === "verified" && Number.isFinite(checked) && checked <= now && now - checked < 15 * 60_000;
}

/** Runs from the authenticated recurring scheduler. Never resumes paused, removed or historical content. */
export async function recoverPublishedTournamentRegistrations(db: Firestore, now = new Date()) {
  if (!await tournamentRegistrationReady(db, now.getTime())) return { recovered: 0 };
  const stateRef = db.collection("operationalReadiness").doc("tournament_registration_recovery"), state = await stateRef.get();
  let query = db.collection("tournaments").where("status", "==", "scheduled").where("publicationPolicyVersion", "==", 1).where("registrationHoldReason", "==", "scheduler_unavailable").orderBy(FieldPath.documentId()).limit(100);
  if (typeof state.data()?.cursor === "string") query = query.startAfter(state.data()!.cursor);
  const candidates = await query.get();
  let recovered = 0;
  for (const candidate of candidates.docs) {
    if (candidate.data().publicationPolicyVersion !== 1 || candidate.data().registrationHoldReason !== "scheduler_unavailable") continue;
    const changed = await db.runTransaction(async tx => {
      const latest = await tx.get(candidate.ref), record = latest.data();
      if (!record || record.status !== "scheduled" || record.publicationPolicyVersion !== 1 || !record.publishedAt || record.registrationHoldReason !== "scheduler_unavailable" || !record.creatorMediaVerification || !evaluateTournamentReadiness(record).ready) return false;
      if (record.financialRestriction || record.settlementRestricted === true || record.stripeDisputeRestricted === true) return false;
      if (await readPublicationSafety(db, tx, String(record.hostId ?? record.creatorId), record)) return false;
      if (record.organizationOwnerId) {
        const organization = await tx.get(db.collection("enterpriseOrganizations").doc(String(record.organizationOwnerId)));
        if (!organization.exists || organization.data()?.status !== "active") return false;
      }
      const funding = await getTournamentCreatorFunding(db, candidate.id, record, tx);
      if (Number(record.basePrizeAmountMinor ?? 0) > funding.confirmedCreatorCents || funding.reviewCount > 0) return false;
      tx.update(candidate.ref, { status: "registration_open", registrationAvailability: "open", registrationHoldReason: null, updatedAt: now.toISOString() });
      tx.set(db.collection("tournamentAuditEvents").doc(`registration_recovered_${candidate.id}`), { tournamentId: candidate.id, actorId: "verified_scheduler", action: "registration_automatically_recovered", createdAt: now.toISOString() });
      return true;
    });
    if (changed) recovered++;
  }
  await stateRef.set({ cursor: candidates.size === 100 ? candidates.docs.at(-1)!.id : null, checkedAt: now.toISOString() });
  return { recovered };
}
