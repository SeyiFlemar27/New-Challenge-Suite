import type { Firestore } from "firebase-admin/firestore";

export const KYC_STATUSES = [
  "not_required",
  "required",
  "not_started",
  "in_progress",
  "pending_review",
  "verified",
  "rejected",
  "expired",
  "needs_resubmission"
] as const;

export type KycStatus = typeof KYC_STATUSES[number];

export function normalizeKycStatus(value: unknown): KycStatus {
  const normalized = String(value ?? "").toLowerCase();
  return (KYC_STATUSES as readonly string[]).includes(normalized) ? normalized as KycStatus : "not_started";
}

export function premiumRequiresKyc(profile: Record<string, unknown>) {
  const planId = String(profile.planId ?? profile.subscriptionPlan ?? "free");
  const status = String(profile.planStatus ?? profile.subscriptionStatus ?? "").toLowerCase();
  return planId !== "free" && ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(status);
}

export function safeKycMetadata(userId: string, profile: Record<string, unknown>, providerConfigured: boolean) {
  const required = premiumRequiresKyc(profile);
  const status = required ? normalizeKycStatus(profile.kycStatus ?? (providerConfigured ? "not_started" : "required")) : "not_required";
  return {
    userId,
    kycRequired: required,
    kycStatus: status,
    kycProvider: providerConfigured ? String(process.env.KYC_PROVIDER ?? "provider_pending") : "not_configured",
    kycSessionId: profile.kycSessionId ?? null,
    kycSubmittedAt: profile.kycSubmittedAt ?? null,
    kycVerifiedAt: profile.kycVerifiedAt ?? null,
    kycRejectedAt: profile.kycRejectedAt ?? null,
    kycFailureReason: profile.kycFailureReason ?? null,
    kycLastCheckedAt: profile.kycLastCheckedAt ?? null,
    rawIdentityStored: false,
    providerConfigured
  };
}

export async function loadKycMetadata(db: Firestore, userId: string) {
  const [userSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("profiles").doc(userId).get()
  ]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
  const providerConfigured = Boolean(process.env.KYC_PROVIDER && process.env.KYC_PROVIDER_PUBLIC_KEY);
  return safeKycMetadata(userId, profile, providerConfigured);
}
