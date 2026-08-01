"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function PaidVoteSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.votes} reference={params.get("votePurchaseId")} resourceId={id} copy={{
    eyebrow: "Additional vote purchase",
    pendingTitle: "Confirming vote credits",
    confirmedTitle: "Vote credits confirmed",
    pendingBody: "Additional vote credits remain unavailable until the verified Stripe event is processed.",
    confirmedBody: "Your confirmed vote credits are ready for eligible voting while the challenge voting window remains open.",
    primaryLabel: "Return to Voting",
    primaryHref: `/challenges/${id}/votes`,
    secondaryLabel: "View Challenge",
    secondaryHref: `/challenges/${id}`
  }} />;
}
