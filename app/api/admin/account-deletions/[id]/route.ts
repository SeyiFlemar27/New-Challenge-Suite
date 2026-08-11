import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ action: z.enum(["schedule", "finalize"]), reason: z.string().trim().min(5).max(1000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "users.restrict");
  if (response) return response;
  const db = getAdminDb();
  const auth = getAdminAuth();
  if (!db || !auth) return serverUnavailable("Account deletion review");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Choose a valid deletion action and reason." });
  const { id } = await params;
  const ref = db.collection("accountDeletionRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists || !["deletion_requested", "scheduled_for_deletion"].includes(String(snap.data()?.status ?? ""))) return fail("This deletion request is not available for review.", 409, undefined, "INVALID_DELETION_STATE");
  const now = new Date().toISOString();
  try {
    if (parsed.data.action === "schedule") {
      await ref.set({ status: "scheduled_for_deletion", cancellationAllowed: true, scheduledBy: user!.uid, scheduledAt: now, updatedAt: now }, { merge: true });
    } else {
      await auth.deleteUser(id).catch((error: { code?: string }) => { if (error?.code !== "auth/user-not-found") throw error; });
      const emailHash = String(snap.data()?.emailHash ?? "");
      const enforcementReviewRequired = snap.data()?.enforcementReviewRequired === true;
      const batch = db.batch();
      batch.set(ref, { status: "anonymized", cancellationAllowed: false, finalizedBy: user!.uid, finalizedAt: now, restoreProfile: null, updatedAt: now }, { merge: true });
      batch.set(db.collection("users").doc(id), { displayName: "Deleted User", email: null, accountStatus: "anonymized", deletedAt: now, updatedAt: now }, { merge: true });
      batch.set(db.collection("profiles").doc(id), { displayName: "Deleted User", email: null, profileVisibility: "private", publicProfileHidden: true, accountStatus: "anonymized", deletedAt: now, updatedAt: now }, { merge: true });
      if (emailHash) batch.set(db.collection("deletedAccountReferences").doc(emailHash), { status: "anonymized", emailReuseAllowed: !enforcementReviewRequired, enforcementReviewRequired, emailReleasedAt: now, updatedAt: now }, { merge: true });
      await batch.commit();
    }
    const auditRef = db.collection("auditLogs").doc();
    await auditRef.set({ id: auditRef.id, actorId: user!.uid, actorType: "admin", action: `account.deletion_${parsed.data.action}d`, targetType: "account", targetId: id, previousStatus: snap.data()?.status, newStatus: parsed.data.action === "schedule" ? "scheduled_for_deletion" : "anonymized", reason: parsed.data.reason, relatedDeletionRequestId: id, immutable: true, createdAt: now });
    return ok({ id, status: parsed.data.action === "schedule" ? "scheduled_for_deletion" : "anonymized" }, parsed.data.action === "schedule" ? "Account deletion scheduled." : "Account deletion finalized with retained records preserved.");
  } catch (error) {
    return serverError("Account deletion review could not be completed.", error instanceof Error ? error.message : error);
  }
}
