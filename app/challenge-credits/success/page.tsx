"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function ChallengeCreditSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.challengeCredits} reference={params.get("session_id")} copy={{
    eyebrow: "Historical Challenge Credit payment",
    pendingTitle: "Checking the historical payment",
    confirmedTitle: "Historical payment confirmed",
    pendingBody: "Payment status comes from the verified provider record. Challenge Credits are retired and cannot be purchased or spent.",
    confirmedBody: "This payment is preserved in your history. Challenge Credits are retired and cannot be spent or replenished.",
    primaryLabel: "View Legacy History",
    primaryHref: "/challenge-credits",
    secondaryLabel: "Explore Challenges",
    secondaryHref: "/explore"
  }} />;
}
