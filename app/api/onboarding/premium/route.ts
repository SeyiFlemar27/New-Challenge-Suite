import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function iso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Premium onboarding");

  const [accountSnap, profileSnap, payoutSnap, creatorChallenges, hostChallenges] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("payoutMethods").where("userId", "==", user.uid).limit(1).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(1).get(),
    db.collection("challenges").where("hostId", "==", user.uid).limit(1).get().catch(() => null)
  ]);
  const account = accountSnap.data() ?? {};
  const profile = profileSnap.data() ?? {};
  const combined = { ...profile, ...account };
  const tier = getEffectiveTier(combined);
  const planStatus = String(account.planStatus ?? account.subscriptionStatus ?? "").toLowerCase();
  const providerConfirmed = account.webhookConfirmed === true || account.entitlementActive === true;
  const active = providerConfirmed && ["active", "confirmed", "trialing"].includes(planStatus);
  const kycStatus = String(profile.kycStatus ?? account.kycStatus ?? "not_started").toLowerCase();
  const profileComplete = Boolean(String(profile.displayName ?? account.displayName ?? "").trim() && String(profile.username ?? account.username ?? "").trim());
  const firstName = String(profile.displayName ?? account.displayName ?? user.email ?? "Member").trim().split(/\s+/)[0];

  return ok({
    subscription: {
      active,
      providerConfirmed,
      planName: tier.displayName,
      planId: tier.id,
      status: planStatus || "processing",
      billingCycle: String(account.billingCycle ?? account.subscriptionInterval ?? "monthly"),
      amountCents: Number.isFinite(Number(account.amountCents)) ? Number(account.amountCents) : null,
      currency: String(account.currency ?? "USD").toUpperCase(),
      paymentReference: String(account.providerSessionId ?? account.stripeCheckoutSessionId ?? "") || null,
      subscriptionReference: String(account.stripeSubscriptionId ?? account.subscriptionId ?? "") || null,
      activationDate: iso(account.confirmedAt ?? account.activatedAt ?? account.currentPeriodStart),
      nextRenewalDate: iso(account.currentPeriodEnd),
      paymentMethod: String(account.paymentMethodLabel ?? account.paymentMethodType ?? "Stripe")
    },
    user: { firstName, accountType: String(account.accountType ?? account.role ?? "user") },
    checklist: {
      subscriptionActivated: active,
      identityVerification: ["approved", "verified", "complete", "completed"].includes(kycStatus),
      identityStatus: kycStatus,
      profileComplete,
      payoutMethodComplete: !payoutSnap.empty,
      firstChallengeComplete: !creatorChallenges.empty || Boolean(hostChallenges && !hostChallenges.empty)
    },
    dashboardHref: String(account.accountType ?? account.role ?? "").toLowerCase() === "sponsor" ? "/sponsor/dashboard" : String(account.accountType ?? account.role ?? "").toLowerCase() === "host" ? "/dashboard/host" : "/dashboard"
  }, active ? "Verified premium onboarding status loaded." : "Subscription confirmation is still processing.");
}