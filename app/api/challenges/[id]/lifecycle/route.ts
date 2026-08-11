import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { challengeIntegritySources, challengeLifecycleActions } from "@/lib/server/challenge-deletion";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ action: z.enum(["delete", "cancel", "archive", "request_admin_deletion"]), confirmed: z.boolean().optional(), reason: z.string().trim().max(1000).optional() });

async function load(request: Request, id: string) {
  const auth = await requireRequestUser(request);
  if (auth.response || !auth.user) return { response: auth.response, user: null, db: null, challenge: null, activityFlags: [] as string[] };
  const db = getAdminDb();
  if (!db) return { response: serverUnavailable("Challenge lifecycle"), user: null, db: null, challenge: null, activityFlags: [] as string[] };
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return { response: fail("Challenge not found.", 404), user: null, db: null, challenge: null, activityFlags: [] as string[] };
  const challenge = { id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!auth.user.isAdmin && !userOwnsChallenge(challenge, auth.user.uid)) return { response: fail("Only the challenge owner can manage this lifecycle.", 403), user: null, db: null, challenge: null, activityFlags: [] as string[] };
  const snapshots = await Promise.all(challengeIntegritySources.map(([collection, field]) => db.collection(collection).where(field, "==", id).limit(1).get().catch(() => null)));
  const activityFlags = [...new Set(snapshots.flatMap((snapshot, index) => snapshot && !snapshot.empty ? [challengeIntegritySources[index][2]] : []))];
  return { response: null, user: auth.user, db, challenge, activityFlags };
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
      if (!actions.cancelAllowed) return fail("This challenge can no longer be cancelled.", 409);
      if (!reason) return validationError({ reason: "A cancellation reason is required." });
      await state.db.collection("challenges").doc(id).set({ status: "cancelled", lifecycleStatus: "cancelled", visibility: "hidden", cancellationReason: reason, cancelledAt: now, cancelledBy: state.user.uid, updatedAt: now }, { merge: true });
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
    return serverError("Challenge lifecycle action could not be completed.", error instanceof Error ? error.message : error);
  }
}
