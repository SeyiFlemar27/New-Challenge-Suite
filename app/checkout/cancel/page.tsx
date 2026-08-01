"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<CheckoutCancelFallback />}>
      <CheckoutCancelContent />
    </Suspense>
  );
}

function CheckoutCancelContent() {
  const searchParams = useSearchParams();
  const paymentPurpose = searchParams.get("paymentPurpose");
  const challengeId = searchParams.get("challengeId");
  const paidEntryReturn = paymentPurpose === "challenge_entry_fee" || paymentPurpose === "challenge_entry";
  const prizeFundingReturn = paymentPurpose === "prize_pool_funding";
  const href = prizeFundingReturn && challengeId ? `/challenges/${challengeId}/prize-funding` : paidEntryReturn && challengeId ? `/challenges/${challengeId}` : "/subscriptions";
  const label = prizeFundingReturn ? "Back to Prize Funding" : paidEntryReturn ? "Back to Challenge" : "Choose a Plan";

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-12">
      <Card className="w-full max-w-xl p-8 text-center">
        <h1 className="text-3xl font-black">Checkout Cancelled</h1>
        <p className="mt-4 text-slate-300">
          No subscription, paid entry, vote credit, sponsor contribution, ledger, prize, or payout changes were made by this page.
        </p>
        {paidEntryReturn ? (
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">
            Your challenge entry remains unpaid and inactive until Stripe webhook confirmation completes for a paid checkout.
          </p>
        ) : null}
        <LinkButton href={href} className="mt-8">{label}</LinkButton>
      </Card>
    </main>
  );
}

function CheckoutCancelFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-12">
      <Card className="w-full max-w-xl p-8 text-center">
        <h1 className="text-3xl font-black">Checkout Cancelled</h1>
        <p className="mt-4 text-slate-300">No payment, ledger, prize, or payout changes were made.</p>
      </Card>
    </main>
  );
}
