"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function ChallengeCreditSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.challengeCredits} reference={params.get("session_id")} copy={{
    eyebrow: "Challenge Credit purchase",
    pendingTitle: "Confirming your Challenge Credits",
    confirmedTitle: "Challenge Credits added",
    pendingBody: "Your Challenge Credits will appear after the verified Stripe event is processed.",
    confirmedBody: "Your Challenge Credits are ready to use for eligible Challenge Suite actions.",
    primaryLabel: "Check Credit Wallet",
    primaryHref: "/challenge-credits",
    secondaryLabel: "Explore Challenges",
    secondaryHref: "/explore"
  }} />;
}
