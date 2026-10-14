import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";
import { dispatchConfiguredNormalLifecycle } from "@/lib/server/normal-lifecycle-scheduler";
import { isEnteredParticipantStatus } from "@/lib/server/submission-lifecycle";

async function action(request: Request, id: string, admin: boolean) {
  const auth = admin ? await requireRecentAdminAuthentication(request, "appeals.manage") : await requireRequestUser(request);
  if (auth.response || !auth.user) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission appeals");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (reason.length < 8 || (admin && (body.confirmed !== true || !["uphold", "approve"].includes(String(body.decision))))) return fail("A reason and valid confirmed decision are required.", 422);
  try {
    const result = await db.runTransaction(async transaction => {
      const submissionRef = db.collection("submissions").doc(id);
      const appealRef = db.collection("appeals").doc(`normal_submission_${id}`);
      const [submission, appeal] = await Promise.all([transaction.get(submissionRef), transaction.get(appealRef)]);
      if (!submission.exists) throw new Error("NOT_FOUND");
      const data = submission.data() ?? {};
      const challengeRef = db.collection("challenges").doc(String(data.challengeId));
      const challenge = await transaction.get(challengeRef);
      if (!challenge.exists || challenge.data()?.builderVersion !== "normal_v3") throw new Error("NOT_FOUND");
      const now = new Date();
      if (!admin && data.userId !== auth.user!.uid) throw new Error("FORBIDDEN");
      if (appeal.exists && !admin) return { idempotent: true, status: appeal.data()?.status };
      if (challenge.data()?.effectiveVotingStartsAt || ["completed", "cancelled", "paused", "winners_announced"].includes(String(challenge.data()?.status))) throw new Error("APPEAL_STATE_LOCKED");
      if (!admin && (data.status !== "rejected" || !data.finalRejectedAt || !(now.getTime() < normalTimestamp(data.appealDeadline)))) throw new Error("APPEAL_WINDOW_CLOSED");
      if (admin && (!appeal.exists || !["submitted", "under_review"].includes(String(appeal.data()?.status)))) throw new Error("APPEAL_ALREADY_RESOLVED");
      if (admin && body.decision === "approve") {
        const participant = await transaction.get(db.collection("challengeParticipants").doc(`${String(data.challengeId)}_${String(data.userId)}`));
        const admission = participant.data() ?? {};
        const monetization = challenge.data()?.monetization as Record<string, unknown> | undefined;
        const paidEntry = admission.paidEntryEnabled || challenge.data()?.paidEntryEnabled || monetization?.paidEntryRequested;
        if (!participant.exists || !isEnteredParticipantStatus(admission.status) || admission.disqualifiedAt || admission.financialRestricted || (paidEntry && !["paid", "confirmed"].includes(String(admission.entryPaymentStatus)))) throw new Error("PARTICIPANT_NOT_ELIGIBLE");
        if (data.status !== "rejected" || !data.finalRejectedAt || appeal.data()?.rejectedRevision !== (data.revisionNumber ?? 0)) throw new Error("APPEAL_STATE_CHANGED");
      }
      const iso = now.toISOString();
      if (admin) {
        const approved = body.decision === "approve";
        transaction.update(submissionRef, { appealStatus: "resolved", appealOutcome: body.decision, appealResolvedAt: iso, appealResolvedBy: auth.user!.uid, ...(approved ? { status: "approved", moderationStatus: "approved", publicEligible: true, leaderboardEligible: true, approvedAt: iso } : {}), updatedAt: iso });
        transaction.update(appealRef, { status: "resolved", decision: body.decision, resolutionSummary: reason, resolvedBy: auth.user!.uid, resolvedAt: iso, updatedAt: iso });
      } else {
        transaction.create(appealRef, { id: appealRef.id, type: "normal_submission_appeal", submissionId: id, challengeId: data.challengeId, userId: data.userId, reason, rejectionReason: data.rejectionReason ?? null, rejectedRevision: data.revisionNumber ?? 0, status: "submitted", createdAt: iso, updatedAt: iso });
        transaction.update(submissionRef, { appealStatus: "submitted", appealId: appealRef.id, appealSubmittedAt: iso, updatedAt: iso });
      }
      transaction.set(challengeRef, { normalVotingGate: "moderation_pending", updatedAt: iso }, { merge: true });
      if (challenge.data()?.normalLifecyclePolicyVersion === 1) wakeNormalLifecycleJob(db, transaction, String(data.challengeId), iso);
      transaction.create(db.collection("auditLogs").doc(), { actorId: auth.user!.uid, action: admin ? "normal.appeal_resolved" : "normal.appeal_submitted", targetId: id, challengeId: data.challengeId, reason, before: { status: data.status, appealStatus: data.appealStatus ?? null }, after: { appealStatus: admin ? "resolved" : "submitted", decision: admin ? body.decision : null }, createdAt: iso });
      return { status: admin ? "resolved" : "submitted" };
    });
    await dispatchConfiguredNormalLifecycle(db);
    return ok(result, "Appeal recorded.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "APPEAL_FAILED";
    return fail("The appeal could not be recorded in its current state.", code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 409, undefined, code);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return action(request, (await params).id, false); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return action(request, (await params).id, true); }
