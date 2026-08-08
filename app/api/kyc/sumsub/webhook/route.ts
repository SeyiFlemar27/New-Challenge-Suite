import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { normalizeKycStatus } from "@/lib/server/kyc";
import { normalizeSumsubKycStatus, safeSumsubApplicantId, safeSumsubExternalUserId, sumsubWebhookSignature, verifySumsubWebhookSignature } from "@/lib/server/sumsub";
import { deterministicId } from "@/lib/server/idempotency";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";

export const dynamic = "force-dynamic";

function eventId(payload: Record<string, unknown>, rawBody: string) {
  const direct = payload.id ?? payload.eventId ?? payload.correlationId ?? payload.applicantId;
  return typeof direct === "string" && direct ? direct : deterministicId("sumsub_webhook", rawBody);
}

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sumsub webhook");
  const rawBody = await request.text();
  const signature = sumsubWebhookSignature(request);
  if (!verifySumsubWebhookSignature(rawBody, signature)) {
    return fail("Invalid Sumsub webhook signature.", 401, undefined, "INVALID_WEBHOOK_SIGNATURE");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail("Webhook body must be valid JSON.", 400, undefined, "VALIDATION_ERROR");
  }

  const id = eventId(payload, rawBody);
  const eventRef = db.collection("sumsubWebhookEvents").doc(id);
  const now = new Date().toISOString();
  try {
    const duplicate = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(eventRef);
      if (snap.exists) return true;
      transaction.set(eventRef, { id, provider: "sumsub", receivedAt: now, processedAt: null, status: "processing", eventType: payload.type ?? payload.reviewStatus ?? null });
      return false;
    });
    if (duplicate) return ok({ received: true, duplicate: true }, "Sumsub webhook already processed.");

    const applicantId = safeSumsubApplicantId(payload);
    const externalUserId = safeSumsubExternalUserId(payload);
    if (!applicantId && !externalUserId) {
      await eventRef.set({ status: "ignored", reason: "missing_applicant_or_external_user", processedAt: now }, { merge: true });
      return ok({ received: true, handled: false }, "Sumsub webhook ignored.");
    }

    const userId = externalUserId || null;
    let resolvedUserId = userId;
    if (!resolvedUserId && applicantId) {
      const match = await db.collection("kycMetadata").where("sumsubApplicantId", "==", applicantId).limit(1).get();
      resolvedUserId = match.docs[0]?.id ?? null;
    }
    if (!resolvedUserId) {
      await eventRef.set({ status: "ignored", reason: "user_not_found", applicantId, processedAt: now }, { merge: true });
      return ok({ received: true, handled: false }, "Sumsub webhook user was not found.");
    }

    const normalized = normalizeSumsubKycStatus(payload);
    const kycRef = db.collection("kycMetadata").doc(resolvedUserId);
    const userRef = db.collection("users").doc(resolvedUserId);
    const profileRef = db.collection("profiles").doc(resolvedUserId);
    const auditRef = db.collection("adminAuditLogs").doc(deterministicId("sumsub_audit", id, resolvedUserId));

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(kycRef);
      const previousStatus = normalizeKycStatus(current.data()?.kycStatus);
      const update = {
        userId: resolvedUserId,
        kycRequired: true,
        kycStatus: normalized.status,
        premiumAccessState: normalized.status === "verified" ? "active" : "pending_kyc",
        kycProvider: "sumsub",
        sumsubApplicantId: applicantId ?? current.data()?.sumsubApplicantId ?? null,
        sumsubProviderStatus: normalized.providerStatus,
        sumsubReviewAnswer: normalized.reviewAnswer,
        sumsubReviewRejectType: normalized.reviewRejectType,
        kycFailureReason: normalized.reason,
        kycSubmittedAt: normalized.status === "pending_review" ? now : current.data()?.kycSubmittedAt ?? null,
        kycVerifiedAt: normalized.status === "verified" ? now : current.data()?.kycVerifiedAt ?? null,
        kycRejectedAt: ["rejected", "needs_resubmission"].includes(normalized.status) ? now : current.data()?.kycRejectedAt ?? null,
        kycLastCheckedAt: now,
        rawIdentityStored: false,
        updatedAt: now,
        createdAt: current.data()?.createdAt ?? now
      };
      transaction.set(kycRef, update, { merge: true });
      transaction.set(userRef, update, { merge: true });
      transaction.set(profileRef, update, { merge: true });
      transaction.set(eventRef, { status: "processed", processedAt: now, userId: resolvedUserId, applicantId, previousStatus, newStatus: normalized.status }, { merge: true });
      transaction.set(auditRef, { id: auditRef.id, userId: resolvedUserId, applicantId, action: "sumsub_kyc_status_update", source: "sumsub_webhook", eventId: id, previousStatus, newStatus: normalized.status, safeReason: normalized.reason, createdAt: now, rawIdentityStored: false });
    });

    if (normalized.status === "verified") {
      await awardDoroCoinEngagement(db, { userId: resolvedUserId, sourceType: "profile_verification", actionId: resolvedUserId, providerVerified: true }).catch(async (error) => {
        await db.collection("adminActionTasks").doc(deterministicId("doro_verification_failure", resolvedUserId)).set({ type: "dorocoin_reward_delivery_failure", sourceType: "profile_verification", userId: resolvedUserId, status: "open", message: error instanceof Error ? error.message : "Reward delivery failed.", createdAt: now }, { merge: true });
      });
    }

    return ok({ received: true, handled: true }, "Sumsub webhook processed.");
  } catch (error) {
    await eventRef.set({ status: "error", processedAt: now, error: error instanceof Error ? error.message : "Unknown webhook error" }, { merge: true }).catch(() => undefined);
    console.error("[sumsub:webhook]", { error: error instanceof Error ? error.message : "Unknown webhook error" });
    return serverError("Sumsub webhook could not be processed.", "Provider webhook processing failed.");
  }
}
