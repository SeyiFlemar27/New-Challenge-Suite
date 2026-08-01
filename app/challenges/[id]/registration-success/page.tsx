"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function RegistrationSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.challengeEntry} reference={params.get("entryPaymentId")} resourceId={id} copy={{
    eyebrow: "Challenge registration",
    pendingTitle: "Confirming your entry payment",
    confirmedTitle: "Registered - Submission Required",
    pendingBody: "Your registration will continue after the provider-confirmed payment reaches Challenge Suite.",
    confirmedBody: "Your paid registration is active. Complete the required entry details, upload your submission, review it, and submit before the deadline.",
    primaryLabel: "Complete Entry Details",
    primaryHref: `/challenges/${id}/join`,
    secondaryLabel: "View Challenge",
    secondaryHref: `/challenges/${id}`
  }} />;
}
