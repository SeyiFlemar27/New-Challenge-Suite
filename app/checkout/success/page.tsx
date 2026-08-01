"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LegacyCheckoutReturnPage() {
  return <Suspense><CheckoutReturnDispatcher /></Suspense>;
}

function CheckoutReturnDispatcher() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    const purpose = params.get("paymentPurpose");
    const challengeId = params.get("challengeId");
    let destination = "/dashboard";

    if (params.get("plan")) destination = `/checkout/subscription/success?${next.toString()}`;
    else if ((purpose === "challenge_entry_fee" || purpose === "challenge_entry") && challengeId) destination = `/challenges/${encodeURIComponent(challengeId)}/registration-success?${next.toString()}`;
    else if (purpose === "paid_vote" && challengeId) destination = `/challenges/${encodeURIComponent(challengeId)}/paid-votes/success?${next.toString()}`;
    else if (purpose === "sponsor_funding" && challengeId) destination = `/sponsor/funding/${encodeURIComponent(challengeId)}/success?${next.toString()}`;
    router.replace(destination);
  }, [params, router]);

  return <main className="flex min-h-screen items-center justify-center bg-black px-6"><p className="text-sm font-bold text-slate-300">Opening your verified payment status...</p></main>;
}
