import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { operationalTaskId, taskDeadline } from "@/lib/server/admin-operations";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { accountHistorySources, historyFlagsFromSnapshots, normalizedEmailHash, normalizeAccountDeletionStatus, seriousEnforcementState } from "@/lib/server/account-deletion";

const schema = z.object({ confirmation: z.literal("DELETE"), email: z.string().trim().email() });
const RECENT_AUTH_SECONDS = 10 * 60;

export async function GET(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account deletion status");
  const [requestSnap, accountSnap] = await Promise.all([db.collection("accountDeletionRequests").doc(user!.uid).get(), db.collection("users").doc(user!.uid).get()]);
  const deletion = requestSnap.data() ?? {};
  const status = normalizeAccountDeletionStatus(deletion.status ?? accountSnap.data()?.accountStatus);
  return ok({ status, cancellationAllowed: Boolean(deletion.cancellationAllowed && status === "deletion_requested"), requestedAt: deletion.requestedAt ?? null, retainedFinancialAndAuditRecords: Boolean(deletion.retainedFinancialAndAuditRecords) }, "Account deletion status loaded.");
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account deletion cancellation");
  const requestRef = db.collection("accountDeletionRequests").doc(user!.uid);
  const snap = await requestRef.get();
  if (!snap.exists || normalizeAccountDeletionStatus(snap.data()?.status) !== "deletion_requested" || snap.data()?.cancellationAllowed !== true) return fail("This deletion request can no longer be cancelled.", 409, undefined, "DELETION_CANCELLATION_UNAVAILABLE");
  const now = new Date().toISOString();
  const restoreProfile = snap.data()?.restoreProfile && typeof snap.data()?.restoreProfile === "object" ? snap.data()!.restoreProfile as Record<string, unknown> : {};
  const emailHash = String(snap.data()?.emailHash ?? normalizedEmailHash(user!.email ?? ""));
  const batch = db.batch();
  batch.set(db.collection("profiles").doc(user!.uid), { ...restoreProfile, email: user!.email ?? null, accountStatus: "active", publicProfileHidden: false, deletionRequestedAt: null, updatedAt: now }, { merge: true });
  batch.set(db.collection("users").doc(user!.uid), { displayName: restoreProfile.displayName ?? "Account", email: user!.email ?? null, accountStatus: "active", deletionRequestedAt: null, updatedAt: now }, { merge: true });
  batch.set(requestRef, { status: "active", cancellationAllowed: false, cancelledAt: now, restoreProfile: null, updatedAt: now }, { merge: true });
  batch.set(db.collection("deletedAccountReferences").doc(emailHash), { status: "cancelled", emailReuseAllowed: false, updatedAt: now }, { merge: true });
  const auditRef = db.collection("auditLogs").doc();
  batch.set(auditRef, { id: auditRef.id, actorId: user!.uid, actorType: "user", action: "account.deletion_cancelled", targetType: "account", targetId: user!.uid, previousStatus: "deletion_requested", newStatus: "active", relatedDeletionRequestId: requestRef.id, immutable: true, createdAt: now });
  await batch.commit();
  return ok({ status: "active" }, "Account deletion was cancelled.");
}

export async function POST(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  const adminAuth = getAdminAuth();
  if (!db || !adminAuth) return serverUnavailable("Account deletion");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ confirmation: "Type DELETE and enter your account email to confirm deletion." });
  if (parsed.data.email.toLowerCase() !== String(user?.email ?? "").toLowerCase()) return validationError({ email: "Enter the email address currently linked to this account." });
  const authAge = Math.floor(Date.now() / 1000) - Number(user?.authTime ?? 0);
  if (!user?.authTime || authAge > RECENT_AUTH_SECONDS) {
    return fail("Recent authentication is required. Sign out, sign back in, and try again.", 403, undefined, "RECENT_AUTH_REQUIRED");
  }

  try {
    const [history, accountSnapshot, profileSnapshot] = await Promise.all([
      Promise.all(accountHistorySources.map(([collection, field]) => db.collection(collection).where(field, "==", user!.uid).limit(1).get().catch(() => ({ empty: true }) as FirebaseFirestore.QuerySnapshot))),
      db.collection("users").doc(user!.uid).get(),
      db.collection("profiles").doc(user!.uid).get()
    ]);
    const accountRecord = { ...(accountSnapshot.data() ?? {}), ...(profileSnapshot.data() ?? {}) } as Record<string, unknown>;
    const historyFlags = historyFlagsFromSnapshots(history, accountRecord);
    const hasRetainedHistory = historyFlags.length > 0;
    const emailHash = normalizedEmailHash(parsed.data.email);
    const enforcementReviewRequired = seriousEnforcementState(accountRecord) || historyFlags.includes("safetyHistory");
    const now = new Date().toISOString();
    const requestRef = db.collection("accountDeletionRequests").doc(user!.uid);
    const tombstoneRef = db.collection("deletedAccountReferences").doc(emailHash);
    if (!hasRetainedHistory) {
      const releaseBatch = db.batch();
      releaseBatch.set(requestRef, { id: user!.uid, userId: user!.uid, emailHash, status: "auth_release_pending", directDeletion: true, retainedFinancialAndAuditRecords: false, historyFlags, enforcementReviewRequired: false, cancellationAllowed: false, requestedAt: now, updatedAt: now, finalizedAt: null }, { merge: true });
      releaseBatch.set(tombstoneRef, { id: emailHash, previousUserIdHash: normalizedEmailHash(user!.uid), status: "auth_release_pending", emailReuseAllowed: false, enforcementReviewRequired: false, createdAt: now, updatedAt: now, emailReleasedAt: null }, { merge: true });
      const requestAuditRef = db.collection("auditLogs").doc();
      releaseBatch.set(requestAuditRef, { id: requestAuditRef.id, actorId: user!.uid, actorType: "user", action: "account.deletion_requested", targetType: "account", targetId: user!.uid, previousStatus: "active", newStatus: "auth_release_pending", reason: "User-confirmed account deletion request.", relatedDeletionRequestId: requestRef.id, immutable: true, metadata: { directDeletion: true, retainedFinancialAndAuditRecords: false, historyFlags }, createdAt: now });
      await releaseBatch.commit();

      try {
        await adminAuth.deleteUser(user!.uid);
      } catch (releaseError) {
        if ((releaseError as { code?: string })?.code !== "auth/user-not-found") {
          const failedAt = new Date().toISOString();
          const taskId = operationalTaskId("account_auth_release", user!.uid);
          const failureBatch = db.batch();
          failureBatch.set(requestRef, { status: "auth_release_failed", emailReleaseFailedAt: failedAt, updatedAt: failedAt }, { merge: true });
          failureBatch.set(tombstoneRef, { status: "auth_release_failed", emailReuseAllowed: false, emailReleaseFailedAt: failedAt, updatedAt: failedAt }, { merge: true });
          failureBatch.set(db.collection("adminActionTasks").doc(taskId), { id: taskId, sourceType: "account_auth_release", sourceCollection: "accountDeletionRequests", sourceId: user!.uid, title: "Firebase Auth email release failed", reason: "The account cannot be finalized or reused until its authentication identity is released.", state: "unassigned", priority: "high", slaDueAt: taskDeadline("support_ticket", failedAt), createdAt: failedAt, updatedAt: failedAt }, { merge: true });
          const failureAuditRef = db.collection("auditLogs").doc();
          failureBatch.set(failureAuditRef, { id: failureAuditRef.id, actorId: user!.uid, actorType: "user", action: "account.auth_release_failed", targetType: "account", targetId: user!.uid, previousStatus: "auth_release_pending", newStatus: "auth_release_failed", relatedDeletionRequestId: requestRef.id, immutable: true, createdAt: failedAt });
          await failureBatch.commit();
          return serverError("Account deletion is waiting for support to release the sign-in email.");
        }
      }

      const finalizedAt = new Date().toISOString();
      const finalBatch = db.batch();
      finalBatch.delete(db.collection("profiles").doc(user!.uid));
      finalBatch.set(db.collection("users").doc(user!.uid), { displayName: "Deleted account", email: null, accountStatus: "deleted", deletedAt: finalizedAt, updatedAt: finalizedAt });
      finalBatch.delete(db.collection("notificationPreferences").doc(user!.uid));
      finalBatch.delete(db.collection("userPreferences").doc(user!.uid));
      finalBatch.set(requestRef, { status: "deleted", finalizedAt, emailReleasedAt: finalizedAt, updatedAt: finalizedAt }, { merge: true });
      finalBatch.set(tombstoneRef, { status: "deleted", emailReuseAllowed: true, emailReleasedAt: finalizedAt, updatedAt: finalizedAt }, { merge: true });
      for (const action of ["account.deleted", "account.email_released_for_reuse"]) {
        const auditRef = db.collection("auditLogs").doc();
        finalBatch.set(auditRef, { id: auditRef.id, actorId: user!.uid, actorType: "user", action, targetType: "account", targetId: user!.uid, previousStatus: "auth_release_pending", newStatus: "deleted", reason: "Firebase Auth identity was released before account deletion was finalized.", relatedDeletionRequestId: requestRef.id, immutable: true, metadata: { directDeletion: true, retainedFinancialAndAuditRecords: false, historyFlags }, createdAt: finalizedAt });
      }
      await finalBatch.commit();
      return ok({ status: "deleted", directDeletion: true }, "Account deleted.");
    }

    const batch = db.batch();
    batch.set(requestRef, { id: user!.uid, userId: user!.uid, emailHash, status: "deletion_requested", directDeletion: false, retainedFinancialAndAuditRecords: true, historyFlags, enforcementReviewRequired, cancellationAllowed: true, requestedAt: now, updatedAt: now, finalizedAt: null }, { merge: true });
    batch.set(tombstoneRef, { id: emailHash, previousUserIdHash: normalizedEmailHash(user!.uid), status: "deletion_requested", emailReuseAllowed: false, enforcementReviewRequired, createdAt: now, updatedAt: now, emailReleasedAt: null }, { merge: true });
    {
      const restoreProfile = { displayName: profileSnapshot.data()?.displayName ?? accountSnapshot.data()?.displayName ?? null, firstName: profileSnapshot.data()?.firstName ?? null, lastName: profileSnapshot.data()?.lastName ?? null, username: profileSnapshot.data()?.username ?? null, usernameNormalized: profileSnapshot.data()?.usernameNormalized ?? null, bio: profileSnapshot.data()?.bio ?? "", location: profileSnapshot.data()?.location ?? "", website: profileSnapshot.data()?.website ?? null, socialLinks: profileSnapshot.data()?.socialLinks ?? [], avatarUrl: profileSnapshot.data()?.avatarUrl ?? null, avatarPath: profileSnapshot.data()?.avatarPath ?? null, coverImageUrl: profileSnapshot.data()?.coverImageUrl ?? null, coverImagePath: profileSnapshot.data()?.coverImagePath ?? null, profileVisibility: profileSnapshot.data()?.profileVisibility ?? "public" };
      batch.set(requestRef, { restoreProfile }, { merge: true });
      batch.set(db.collection("profiles").doc(user!.uid), { displayName: "Deleted User", firstName: null, lastName: null, username: null, usernameNormalized: null, email: null, phone: null, bio: "", location: "", website: null, socialLinks: [], avatarUrl: null, avatarPath: null, coverImageUrl: null, coverImagePath: null, profileVisibility: "private", publicProfileHidden: true, accountStatus: "deletion_requested", deletionRequestedAt: now, updatedAt: now }, { merge: true });
      batch.set(db.collection("users").doc(user!.uid), { displayName: "Deleted User", email: null, accountStatus: "deletion_requested", deletionRequestedAt: now, updatedAt: now }, { merge: true });
      const taskId = operationalTaskId("account_deletion", user!.uid);
      batch.set(db.collection("adminActionTasks").doc(taskId), { id: taskId, sourceType: "account_deletion", sourceCollection: "accountDeletionRequests", sourceId: user!.uid, title: "Account deletion privacy review", reason: "The account has retained financial, challenge, identity, or audit history.", state: "unassigned", priority: "normal", slaDueAt: taskDeadline("support_ticket", now), createdAt: now, updatedAt: now }, { merge: true });
    }

    for (const action of ["account.deletion_requested", "account.public_profile_hidden", "account.personal_fields_anonymized"]) {
      const auditRef = db.collection("auditLogs").doc();
      batch.set(auditRef, { id: auditRef.id, actorId: user!.uid, actorType: "user", action, targetType: "account", targetId: user!.uid, previousStatus: "active", newStatus: "deletion_requested", reason: "User-confirmed account deletion request.", relatedDeletionRequestId: requestRef.id, immutable: true, metadata: { directDeletion: false, retainedFinancialAndAuditRecords: true, historyFlags }, createdAt: now });
    }
    await batch.commit();
    await adminAuth.revokeRefreshTokens(user!.uid).catch(() => undefined);
    return ok({ status: "deletion_requested", directDeletion: false, cancellationAllowed: true }, "Account deletion is in progress. Your public profile is hidden and required financial and audit records were preserved for review.");
  } catch (error) {
    return serverError("Account deletion could not be completed.", error instanceof Error ? error.message : error);
  }
}
