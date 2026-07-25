"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, TriangleAlert } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { fetchBootstrapProfile } from "@/lib/api/services";

const activeStatuses = new Set(["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"]);

export default function CheckoutSuccessPage() {
  return <Suspense fallback={<CheckoutPending />}><CheckoutSuccessContent /></Suspense>;
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const expectedPlan = searchParams.get("plan");
  const paymentPurpose = searchParams.get("paymentPurpose");
  const [state, setState] = useState<"pending" | "confirmed" | "incomplete">(expectedPlan ? "pending" : "confirmed");
  const [destination, setDestination] = useState("/dashboard");

  useEffect(() => {
    if (!expectedPlan) return;
    let attempts = 0;
    let cancelled = false;
    let completed = false;
    const check = async () => {
      const result = await fetchBootstrapProfile();
      if (cancelled) return;
      const planId = result.data?.user.planId;
      const planStatus = result.data?.user.planStatus ?? result.data?.user.subscriptionStatus;
      if (result.ok && planId === expectedPlan && activeStatuses.has(String(planStatus))) {
        completed = true;
        setState("confirmed");
        setDestination(expectedPlan === "host" || expectedPlan === "creator" ? "/kyc/status" : "/dashboard");
        return;
      }
      attempts += 1;
      if (attempts >= 12) setState("incomplete");
    };
    void check();
    const timer = window.setInterval(() => {
      if (completed || attempts >= 12) return window.clearInterval(timer);
      void check();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [expectedPlan]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-12 sm:px-8">
      <Card className="w-full max-w-xl border-[var(--gold)]/25 p-6 text-center sm:p-8">
        <BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">{paymentPurpose ? "Secure payment verification" : "Secure plan verification"}</p>
        {state === "pending" ? <Clock3 className="mx-auto mt-5 text-[var(--gold)]" size={42} /> : state === "confirmed" ? <CheckCircle2 className="mx-auto mt-5 text-emerald-400" size={42} /> : <TriangleAlert className="mx-auto mt-5 text-amber-300" size={42} />}
        <h1 className="mt-5 text-3xl font-black text-white sm:text-4xl">{paymentPurpose ? "Payment is being verified" : state === "pending" ? "Your plan is being verified" : state === "confirmed" ? "Your plan is active" : "Payment not completed"}</h1>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">{paymentPurpose ? "Stripe has returned you to Challenge Suite. Entries, vote credits, or sponsor contributions update only after webhook confirmation." : state === "pending" ? "We're confirming your payment. Access changes only after the secure Stripe webhook verifies the subscription." : state === "incomplete" ? "Challenge Suite has not received active subscription confirmation yet. No access was granted by this page." : expectedPlan ? `Your verified ${expectedPlan === "host" ? "Host" : expectedPlan === "creator" ? "Creator" : "subscription"} plan is active. Complete setup or KYC if required.` : "Your checkout returned successfully. Account updates still depend on verified webhook processing."}</p>
        <div className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
          {(paymentPurpose ? ["Payment received", "Webhook confirmation", "Record updated"] : ["Payment received", "Subscription verified", "Setup / KYC"]).map((label, index) => {
            const reached = state === "confirmed" || (state === "pending" && index === 0);
            return <div key={label} className={`rounded-[8px] border p-4 ${reached ? "border-[var(--gold)]/40 bg-[var(--gold)]/10" : "border-white/10 bg-white/[0.025]"}`}><p className="text-xs font-black text-slate-500">0{index + 1}</p><p className={`mt-2 text-sm font-bold ${reached ? "text-[var(--gold)]" : "text-slate-400"}`}>{label}</p></div>;
          })}
        </div>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-slate-400">This page never activates subscriptions, paid entries, vote credits, sponsor contributions, prize pools, ledgers, or payouts by itself.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {state === "confirmed" ? <LinkButton href={destination}>{expectedPlan === "host" || expectedPlan === "creator" ? "Complete KYC" : "Continue to Dashboard"}</LinkButton> : null}
          {state === "confirmed" && expectedPlan === "host" ? <LinkButton href="/onboarding/host" variant="secondary">Start Setup</LinkButton> : null}
          {state === "confirmed" && expectedPlan === "creator" ? <LinkButton href="/onboarding/creator" variant="secondary">Start Setup</LinkButton> : null}
          {state === "incomplete" ? <><LinkButton href="/subscriptions">Try Again</LinkButton><LinkButton href="/subscriptions" variant="secondary">Return to Plans</LinkButton></> : null}
          {state === "pending" ? <Button variant="secondary" onClick={() => window.location.reload()}>Refresh Status</Button> : null}
        </div>
      </Card>
    </main>
  );
}

function CheckoutPending() {
  return <main className="flex min-h-screen items-center justify-center bg-black px-6"><Card className="w-full max-w-2xl p-10 text-center"><BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" /><Clock3 className="mx-auto mt-5 text-[var(--gold)]" size={36} /><h1 className="mt-4 text-3xl font-black">Confirming checkout</h1><p className="mt-3 text-slate-300">Loading your securely verified account status...</p></Card></main>;
}
