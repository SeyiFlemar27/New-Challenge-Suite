"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function SubscriptionSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const params = useSearchParams();
  const plan = params.get("plan") || "premium";
  const needsKyc = plan === "creator" || plan === "host";
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.subscription} reference={params.get("session_id")} resourceId={plan} copy={{
    eyebrow: "Membership activation",
    pendingTitle: "Activating your Host plan",
    confirmedTitle: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan activated`,
    pendingBody: "Your provider-confirmed subscription record is being synchronized.",
    confirmedBody: "Your membership is active. Continue setup now or finish later from your dashboard.",
    primaryLabel: plan === "host" ? "Continue to Host Dashboard" : "Continue Setup",
    primaryHref: plan === "host" ? "/dashboard/host" : "/onboarding/premium?plan=" + encodeURIComponent(plan) + (params.get("session_id") ? "&session_id=" + encodeURIComponent(params.get("session_id")!) : ""),
    secondaryLabel: "Finish Later",
    secondaryHref: "/dashboard?membership=pending"
  }} />;
}
