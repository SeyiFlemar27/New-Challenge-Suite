import type { Firestore } from "firebase-admin/firestore";
import { getSumsubConfig } from "@/lib/server/sumsub";

export const KYC_STATUSES = [
  "not_required",
  "required",
  "not_started",
  "in_progress",
  "pending_review",
  "verified",
  "rejected",
  "expired",
  "needs_resubmission",
  "provider_not_configured",
  "provider_error"
] as const;

export type KycStatus = typeof KYC_STATUSES[number];

export function normalizeKycStatus(value: unknown): KycStatus {
  const normalized = String(value ?? "").toLowerCase();
  return (KYC_STATUSES as readonly string[]).includes(normalized) ? normalized as KycStatus : "not_started";
}

export function premiumRequiresKyc(profile: Record<string, unknown>) {
  const planId = String(profile.planId ?? profile.subscriptionPlan ?? profile.subscriptionPlanId ?? "free");
  const status = String(profile.planStatus ?? profile.subscriptionStatus ?? profile.stripeStatus ?? "").toLowerCase();
  const premium = profile.premium === true || profile.entitlementActive === true;
  return planId !== "free" && (premium || ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(status));
}

export function premiumAccessState(profile: Record<string, unknown>, status: KycStatus) {
  if (!premiumRequiresKyc(profile)) return "free_or_not_required";
  return status === "verified" ? "active" : "pending_kyc";
}

export function safeKycMetadata(userId: string, profile: Record<string, unknown>, providerConfigured: boolean) {
  const required = premiumRequiresKyc(profile);
  const sumsub = getSumsubConfig();
  const rawStatus = profile.kycStatus ?? profile.sumsubKycStatus ?? (providerConfigured ? "not_started" : "provider_not_configured");
  const status = required ? normalizeKycStatus(rawStatus) : "not_required";
  return {
    userId,
    kycRequired: required,
    kycStatus: status,
    premiumAccessState: premiumAccessState(profile, status),
    kycProvider: providerConfigured ? "sumsub" : "not_configured",
    kycSessionId: profile.kycSessionId ?? null,
    kycSubmittedAt: profile.kycSubmittedAt ?? null,
    kycVerifiedAt: profile.kycVerifiedAt ?? null,
    kycRejectedAt: profile.kycRejectedAt ?? null,
    kycFailureReason: profile.kycFailureReason ?? null,
    kycLastCheckedAt: profile.kycLastCheckedAt ?? null,
    sumsubApplicantId: profile.sumsubApplicantId ?? (profile.kyc && typeof profile.kyc === "object" && "sumsubApplicantId" in profile.kyc ? (profile.kyc as Record<string, unknown>).sumsubApplicantId : null),
    sumsubReviewAnswer: profile.sumsubReviewAnswer ?? null,
    sumsubReviewRejectType: profile.sumsubReviewRejectType ?? null,
    sumsubProviderStatus: profile.sumsubProviderStatus ?? null,
    sumsubLevelName: profile.sumsubLevelName ?? (providerConfigured ? sumsub.levelName ?? null : null),
    sumsubEnvironment: providerConfigured ? sumsub.environment : null,
    rawIdentityStored: false,
    providerConfigured
  };
}

export async function loadKycMetadata(db: Firestore, userId: string) {
  const [userSnap, profileSnap, kycSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("profiles").doc(userId).get(),
    db.collection("kycMetadata").doc(userId).get()
  ]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}), ...(kycSnap.data() ?? {}) };
  const providerConfigured = getSumsubConfig().configured;
  return safeKycMetadata(userId, profile, providerConfigured);
}

