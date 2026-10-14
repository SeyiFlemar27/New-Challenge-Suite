import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";

// Financial commitments and classification deliberately have no approval override.
export const normalMaterialChanges = z.object({
  challengeRules: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional(),
  submissionInstructionsList: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  registrationDeadline: z.string().datetime().optional(),
  submissionDeadline: z.string().datetime().optional(),
  votingDeadline: z.string().datetime().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Select a proposed change.");

export function assertNormalMaterialChange(challenge: Record<string, unknown>, changes: Record<string, unknown>, now: number) {
  normalMaterialChanges.parse(changes);
  if (challenge.builderVersion !== "normal_v3" || ["draft", "pending_review", "changes_requested", "completed", "winners_announced", "cancelled"].includes(String(challenge.status))) throw new Error("PUBLISHED_NORMAL_REQUIRED");
  if (challenge.effectiveVotingStartsAt) throw new Error("VOTING_ALREADY_STARTED");
  for (const key of ["registrationDeadline", "submissionDeadline", "votingDeadline"]) {
    if (!(key in changes)) continue;
    const previous = Date.parse(String(challenge[key]));
    const proposed = Date.parse(String(changes[key]));
    if (!Number.isFinite(previous) || previous <= now || proposed < previous) throw new Error("DEADLINE_CANNOT_BE_SHORTENED_OR_REVIVED");
  }
  const next = { ...challenge, ...changes };
  const submission = Date.parse(String(next.submissionDeadline));
  const voting = Date.parse(String(next.votingDeadline));
  const registration = Date.parse(String(next.registrationDeadline));
  if (![registration, submission, voting].every(Number.isFinite) || registration > submission || submission >= voting) throw new Error("INVALID_TIMELINE");
}

export async function proposeNormalMaterialChange(db: Firestore, challengeId: string, actorId: string, expectedUpdatedAt: string, changes: Record<string, unknown>, reason: string) {
  const id = randomUUID();
  await db.runTransaction(async transaction => {
    const ref = db.collection("challenges").doc(challengeId);
    const snap = await transaction.get(ref);
    const current = snap.data() ?? {};
    if (!snap.exists || current.updatedAt !== expectedUpdatedAt) throw new Error("CHALLENGE_STATE_CHANGED");
    assertNormalMaterialChange(current, changes, Date.now());
    const now = new Date().toISOString();
    const before = Object.fromEntries(Object.keys(changes).map(key => [key, current[key] ?? null]));
    transaction.create(db.collection("normalMaterialChangeRequests").doc(id), { challengeId, actorId, creatorId: current.creatorId ?? current.userId ?? actorId, before, proposed: changes, expectedUpdatedAt, reason, status: "pending_review", createdAt: now });
    transaction.create(db.collection("auditLogs").doc(), { action: "normal.material_change_requested", actorId, challengeId, requestId: id, before, proposed: changes, reason, createdAt: now });
  });
  return { id, status: "pending_review" };
}

export async function decideNormalMaterialChange(db: Firestore, id: string, actorId: string, decision: "approve" | "reject", reason: string) {
  return db.runTransaction(async transaction => {
    const requestRef = db.collection("normalMaterialChangeRequests").doc(id);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new Error("NOT_FOUND");
    const proposal = requestSnap.data()!;
    if (proposal.status !== "pending_review") {
      if (proposal.decision === decision) return { duplicate: true, status: proposal.status };
      throw new Error("ALREADY_DECIDED");
    }
    const challengeRef = db.collection("challenges").doc(String(proposal.challengeId));
    const challengeSnap = await transaction.get(challengeRef);
    const current = challengeSnap.data() ?? {};
    const now = new Date().toISOString();
    if (decision === "approve") {
      if (!challengeSnap.exists || current.updatedAt !== proposal.expectedUpdatedAt) throw new Error("CHALLENGE_STATE_CHANGED");
      assertNormalMaterialChange(current, proposal.proposed, Date.now());
      transaction.update(challengeRef, { ...proposal.proposed, ...(proposal.proposed.votingDeadline ? { votingEndsAt: proposal.proposed.votingDeadline, configuredVotingEndsAt: proposal.proposed.votingDeadline } : {}), updatedAt: now, normalContentRevision: Number(current.normalContentRevision ?? 0) + 1 });
    }
    transaction.update(requestRef, { status: decision === "approve" ? "approved" : "rejected", decision, decidedBy: actorId, decisionReason: reason, decidedAt: now });
    transaction.create(db.collection("auditLogs").doc(), { action: `normal.material_change_${decision}`, actorId, challengeId: proposal.challengeId, requestId: id, before: proposal.before, proposed: proposal.proposed, applied: decision === "approve", reason, createdAt: now });
    transaction.create(db.collection("normalNotificationOutbox").doc(`material_${id}`), { challengeId: proposal.challengeId, creatorId: proposal.creatorId, type: "normal_material_change", title: "Challenge change reviewed", message: `A proposed challenge change was ${decision === "approve" ? "approved" : "rejected"}. Review the current challenge information before participating.`, status: "pending", cursor: null, createdAt: now });
    wakeNormalLifecycleJob(db, transaction, String(proposal.challengeId), now);
    return { duplicate: false, status: decision === "approve" ? "approved" : "rejected" };
  });
}
