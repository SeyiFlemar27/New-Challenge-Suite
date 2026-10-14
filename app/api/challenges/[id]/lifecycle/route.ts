import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { challengeIntegritySources, challengeLifecycleActions } from "@/lib/server/challenge-deletion";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { prepareEnterpriseActiveChallengeRelease } from "@/lib/server/enterprise-active-challenge-limit";

const schema = z.object({ action: z.enum(["delete", "cancel", "archive", "request_admin_deletion"]), confirmed: z.boolean().optional(), reason: z.string().trim().max(1000).optional() });

async function load(request: Request, id: string) {
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.user || !access.db || !access.challenge) return { response: access.response, user: null, db: null, challenge: null, activityFlags: [] as string[] };
  const { user, db, challenge } = access;
  const snapshots = await Promise.all(challengeIntegritySources.map(([collection, field]) => db.collection(collection).where(field, "==", id).limit(1).get().catch(() => null)));
  const activityFlags = [...new Set(snapshots.flatMap((snapshot, index) => snapshot && !snapshot.empty ? [challengeIntegritySources[index][2]] : []))];
  return { response: null, user, db, challenge, activityFlags };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await load(request, id);
  if (state.response || !state.challenge) return state.response;
  return ok({ actions: challengeLifecycleActions(state.challenge.status ?? state.challenge.lifecycleStatus, state.activityFlags), activityFlags: state.activityFlags }, "Challenge lifecycle actions loaded.");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await load(request, id);
  if (state.response || !state.db || !state.challenge || !state.user) return state.response;
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ action: "Choose a valid lifecycle action." });
  const actions = challengeLifecycleActions(state.challenge.status ?? state.challenge.lifecycleStatus, state.activityFlags);
  const reason = parsed.data.reason?.trim() ?? "";
  const now = new Date().toISOString();
  try {
    if (parsed.data.action === "delete") {
      if (!actions.hardDeleteAllowed) return fail("This challenge has activity or history and cannot be permanently deleted.", 409, { activityFlags: state.activityFlags }, "CHALLENGE_DELETE_BLOCKED");
      if (parsed.data.confirmed !== true) return validationError({ confirmed: "Confirm challenge deletion before continuing." });
      await state.db.collection("challenges").doc(id).delete();
    } else if (parsed.data.action === "cancel") {
      if (state.challenge.normalLifecyclePolicyVersion === 1 && !state.user.isAdmin) {
        if (!reason) return validationError({ reason: "A cancellation request reason is required." });
        await state.db.runTransaction(async transaction => {
          const challengeRef = state.db!.collection("challenges").doc(id);
          const requestRef = state.db!.collection("challengeCancellationRequests").doc(id);
          const [latest, existing] = await Promise.all([transaction.get(challengeRef), transaction.get(requestRef)]);
          if (!latest.exists || !userOwnsChallenge(latest.data() ?? {}, state.user!.uid)) throw new Error("PERMISSION_DENIED");
          if (latest.data()?.effectiveVotingStartsAt) throw new Error("ORDINARY_CANCELLATION_AFTER_VOTING_PROHIBITED");
          if (existing.exists && existing.data()?.status === "pending_admin_review") return;
          transaction.set(requestRef, { id, challengeId: id, userId: state.user!.uid, status: "pending_admin_review", reason, createdAt: now, updatedAt: now });
          transaction.set(state.db!.collection("adminActionTasks").doc(`normal_cancel_${id}`), { type: "normal_cancellation_request", challengeId: id, status: "open", reason, createdAt: now });
          transaction.create(state.db!.collection("auditLogs").doc(), { actorId: state.user!.uid, action: "normal.cancellation_requested", challengeId: id, reason, challengeContinues: true, createdAt: now });
        });
        return ok({ id, cancellationRequested: true, challengeContinues: true }, "Cancellation requested. The challenge continues until Admin decides.");
      }
      if (state.challenge.normalLifecyclePolicyVersion === 1) {
        const admin = await requireRecentAdminAuthentication(request, "challenges.cancel");
        if (admin.response) return admin.response;
        if (parsed.data.confirmed !== true) return validationError({ confirmed: "Confirm this cancellation." });
      }
      if (!actions.cancelAllowed) return fail("This challenge can no longer be cancelled.", 409);
      if (!reason) return validationError({ reason: "A cancellation reason is required." });
      const challengeRef = state.db.collection("challenges").doc(id);
      await state.db.runTransaction(async (transaction) => {
        const latest = await transaction.get(challengeRef);
        if (!latest.exists) throw new Error("CHALLENGE_NOT_FOUND");
        const data = latest.data() ?? {};
        if (data.normalLifecyclePolicyVersion === 1 && (data.effectiveVotingStartsAt || data.winnersApprovedAt)) throw new Error("ORDINARY_CANCELLATION_AFTER_VOTING_PROHIBITED");
        const release = await prepareEnterpriseActiveChallengeRelease(state.db!, transaction, String(data.organizationOwnerId ?? "") || null, id);
        transaction.set(challengeRef, { status: "cancelled", lifecycleStatus: "cancelled", visibility: "hidden", cancellationReason: reason, cancelledAt: now, cancelledBy: state.user!.uid, ...(data.normalLifecyclePolicyVersion === 1 ? { approvedCancellationAt: now, approvedCancellationBy: state.user!.uid } : {}), updatedAt: now }, { merge: true });
        release.apply();
      });
    } else if (parsed.data.action === "archive") {
      if (!actions.archiveAllowed) return fail("Only completed or cancelled challenges can be archived.", 409);
      await state.db.collection("challenges").doc(id).set({ managementState: "archived", archivedAt: now, archivedBy: state.user.uid, updatedAt: now }, { merge: true });
    } else {
      if (!actions.requestAdminDeletionAllowed) return fail("An admin deletion request is not needed for this challenge.", 409);
      if (!reason) return validationError({ reason: "Explain why this challenge should be reviewed for deletion." });
      const requestRef = state.db.collection("challengeDeletionRequests").doc(id);
      await requestRef.set({ id, challengeId: id, creatorId: state.user.uid, status: "pending_admin_review", reason, activityFlags: state.activityFlags, requestedAt: now, updatedAt: now }, { merge: true });
      await state.db.collection("adminActionTasks").doc(`challenge_deletion_${id}`).set({ id: `challenge_deletion_${id}`, sourceType: "challenge_deletion", sourceCollection: "challengeDeletionRequests", sourceId: id, title: "Challenge deletion review", reason, state: "unassigned", priority: "normal", createdAt: now, updatedAt: now }, { merge: true });
    }
    await writeAuditLog({ actorId: state.user.uid, actorType: state.user.isAdmin ? "admin" : "creator", action: `challenge.${parsed.data.action}`, targetType: "challenge", targetId: id, reason: reason || "Owner-confirmed no-activity deletion.", metadata: { activityFlags: state.activityFlags, recordsPreserved: parsed.data.action !== "delete" } }, state.db);
    return ok({ id, action: parsed.data.action, deleted: parsed.data.action === "delete" }, parsed.data.action === "delete" ? "Challenge deleted." : parsed.data.action === "cancel" ? "Challenge cancelled and hidden from Explore." : parsed.data.action === "archive" ? "Challenge archived." : "Admin deletion review requested.");
  } catch (error) {
    if (error instanceof Error && error.message === "ORDINARY_CANCELLATION_AFTER_VOTING_PROHIBITED") return fail("Voting has started. Exceptional legal or safety concerns require Support/Admin review.", 409, undefined, error.message);
    return serverError("Challenge lifecycle action could not be completed.", error instanceof Error ? error.message : error);
  }
}
