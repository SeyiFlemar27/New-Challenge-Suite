"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";
import { safeVotingReturnPath } from "@/lib/voting-return-path";

export default function DoroCoinSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() {
  const params = useSearchParams();
  const returnTo = safeVotingReturnPath(params.get("returnTo"));
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.dorocoin} reference={params.get("session_id")} copy={{
    eyebrow: "DoroCoin purchase",
    pendingTitle: "Confirming your DoroCoins",
    confirmedTitle: "DoroCoins added",
    pendingBody: "Your DoroCoin credits will appear after the verified Stripe event is processed.",
    confirmedBody: "Your non-cash platform credits are available for eligible Challenge Suite features.",
    primaryLabel: "View DoroCoins",
    primaryHref: "/dorocoins",
    secondaryLabel: returnTo ? "Return to voting (no automatic vote)" : "Explore Challenges",
    secondaryHref: returnTo ?? "/explore"
  }} />;
}
