import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { operationalTaskId, taskDeadline } from "@/lib/server/admin-operations";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ confirmation: z.literal("DELETE") });
const RECENT_AUTH_SECONDS = 10 * 60;
const retainedHistoryQueries = [
  ["cashLedger", "userId"], ["walletTransactions", "userId"], ["challengeEntryPayments", "userId"],
  ["paidVotePurchases", "userId"], ["sponsorContributions", "userId"], ["predictionPayments", "userId"],
  ["doroCoinPurchases", "userId"], ["withdrawalRequests", "userId"], ["kycRecords", "userId"],
  ["challengeSettlements", "userId"], ["challenges", "creatorId"], ["challengeParticipants", "userId"],
  ["submissions", "userId"], ["auditLogs", "targetId"]
] as const;

export async function POST(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  const adminAuth = getAdminAuth();
  if (!db || !adminAuth) return serverUnavailable("Account deletion");
  const body = await readJson(request);
  if (body.response) return body.response;
  if (!schema.safeParse(body.body).success) return validationError({ confirmation: "Type DELETE to confirm account deletion." });
  const authAge = Math.floor(Date.now() / 1000) - Number(user?.authTime ?? 0);
  if (!user?.authTime || authAge > RECENT_AUTH_SECONDS) {
    return fail("Recent authentication is required. Sign out, sign back in, and try again.", 403, undefined, "RECENT_AUTH_REQUIRED");
  }

  try {
    const [history, accountSnapshot, profileSnapshot] = await Promise.all([
      Promise.all(retainedHistoryQueries.map(([collection, field]) => db.collection(collection).where(field, "==", user!.uid).limit(1).get())),
      db.collection("users").doc(user!.uid).get(),
      db.collection("profiles").doc(user!.uid).get()
    ]);
    const accountRecord = { ...(accountSnapshot.data() ?? {}), ...(profileSnapshot.data() ?? {}) } as Record<string, unknown>;
    const kycStatus = String(accountRecord.kycStatus ?? "").toLowerCase();
    const payoutAccount = accountRecord.payoutAccount && typeof accountRecord.payoutAccount === "object" ? accountRecord.payoutAccount as Record<string, unknown> : {};
    const hasKycHistory = !["", "not_started", "not_required", "provider_not_configured"].includes(kycStatus) || Boolean(accountRecord.sumsubApplicantId);
    const hasProviderHistory = ["providerCustomerId", "stripeCustomerId", "subscriptionId", "stripeSubscriptionId"].some((field) => Boolean(accountRecord[field]));
    const hasRetainedAccountState = hasKycHistory || hasProviderHistory || Object.keys(payoutAccount).length > 0;
    const hasRetainedHistory = hasRetainedAccountState || history.some((snapshot) => !snapshot.empty);
    const now = new Date().toISOString();
    const requestRef = db.collection("accountDeletionRequests").doc(user!.uid);
    const batch = db.batch();
    batch.set(requestRef, { id: user!.uid, userId: user!.uid, status: hasRetainedHistory ? "deactivated_pending_privacy_review" : "deleted", directDeletion: !hasRetainedHistory, retainedFinancialAndAuditRecords: hasRetainedHistory, requestedAt: now, updatedAt: now }, { merge: true });

    if (hasRetainedHistory) {
      const anonymousLabel = `Deleted account ${user!.uid.slice(0, 8)}`;
      batch.set(db.collection("profiles").doc(user!.uid), { displayName: anonymousLabel, firstName: null, lastName: null, username: null, usernameNormalized: null, email: null, phone: null, bio: "", location: "", website: null, socialLinks: [], avatarUrl: null, avatarPath: null, coverImageUrl: null, coverImagePath: null, profileVisibility: "private", accountStatus: "deactivated", deletionRequestedAt: now, updatedAt: now }, { merge: true });
      batch.set(db.collection("users").doc(user!.uid), { displayName: anonymousLabel, email: null, accountStatus: "deactivated", deletionRequestedAt: now, updatedAt: now }, { merge: true });
      const taskId = operationalTaskId("account_deletion", user!.uid);
      batch.set(db.collection("adminActionTasks").doc(taskId), { id: taskId, sourceType: "account_deletion", sourceCollection: "accountDeletionRequests", sourceId: user!.uid, title: "Account deletion privacy review", reason: "The account has retained financial, challenge, identity, or audit history.", state: "unassigned", priority: "normal", slaDueAt: taskDeadline("support_ticket", now), createdAt: now, updatedAt: now }, { merge: true });
    } else {
      batch.delete(db.collection("profiles").doc(user!.uid));
      batch.set(db.collection("users").doc(user!.uid), { displayName: "Deleted account", email: null, accountStatus: "deleted", deletedAt: now, updatedAt: now });
      batch.delete(db.collection("notificationPreferences").doc(user!.uid));
      batch.delete(db.collection("userPreferences").doc(user!.uid));
    }

    const auditRef = db.collection("auditLogs").doc();
    batch.set(auditRef, { id: auditRef.id, actorId: user!.uid, actorType: "user", action: hasRetainedHistory ? "account.deactivated_for_deletion" : "account.deleted", targetType: "account", targetId: user!.uid, reason: "User-confirmed account deletion request.", metadata: { directDeletion: !hasRetainedHistory, retainedFinancialAndAuditRecords: hasRetainedHistory }, createdAt: now });
    await batch.commit();
    if (hasRetainedHistory) {
      await adminAuth.updateUser(user!.uid, { disabled: true });
      return ok({ status: "deactivated_pending_privacy_review", directDeletion: false }, "Account deactivated and deletion request submitted. Required financial and audit records were preserved for review.");
    }
    await adminAuth.deleteUser(user!.uid);
    return ok({ status: "deleted", directDeletion: true }, "Account deleted.");
  } catch (error) {
    return serverError("Account deletion could not be completed.", error instanceof Error ? error.message : error);
  }
}
