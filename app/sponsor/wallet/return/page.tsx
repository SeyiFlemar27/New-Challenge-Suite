"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";

export default function SponsorWalletReturnPage() { return <Suspense><Content /></Suspense>; }

function Content() {
  const params = useSearchParams();
  return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.sponsorWallet} reference={params.get("session_id")} copy={{
    eyebrow: "Sponsor Wallet funding",
    pendingTitle: "Confirming Sponsor Wallet funds",
    confirmedTitle: "Sponsor Wallet funds added",
    pendingBody: "Your wallet remains unchanged until the verified Stripe event is processed.",
    confirmedBody: "Your confirmed USD funds are now available for eligible sponsorship commitments.",
    primaryLabel: "Open Sponsor Wallet",
    primaryHref: "/sponsor/wallet",
    secondaryLabel: "Sponsor Dashboard",
    secondaryHref: "/sponsor/dashboard"
  }} />;
}
