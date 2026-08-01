"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function SponsorFundingSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.sponsor} reference={params.get("sponsorContributionId")} resourceId={challengeId} copy={{
    eyebrow: "Sponsor contribution",
    pendingTitle: "Confirming sponsor funding",
    confirmedTitle: "Sponsor contribution confirmed",
    pendingBody: "The contribution remains pending until the verified Stripe event is processed.",
    confirmedBody: "The confirmed contribution is recorded for winner-directed sponsor funding. Branding remains subject to review.",
    primaryLabel: "View Sponsor Dashboard",
    primaryHref: "/sponsor/dashboard",
    secondaryLabel: "View Opportunity",
    secondaryHref: `/sponsor/discover/challenges/${challengeId}`
  }} />;
}
