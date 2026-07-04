"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, TriangleAlert } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { fetchBootstrapProfile } from "@/lib/api/services";

const activeStatuses = new Set(["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"]);

export default function CheckoutSuccessPage() {
  return <Suspense fallback={<CheckoutPending />}><CheckoutSuccessContent /></Suspense>;
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const expectedPlan = searchParams.get("plan");
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
        setDestination(expectedPlan === "host" ? "/onboarding/host" : expectedPlan === "creator" ? "/onboarding/creator" : "/dashboard");
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
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10">
      <Card className="max-w-xl p-8 text-center sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Stripe checkout</p>
        {state === "pending" ? <Clock3 className="mx-auto mt-5 text-[var(--gold)]" size={42} /> : state === "confirmed" ? <CheckCircle2 className="mx-auto mt-5 text-emerald-400" size={42} /> : <TriangleAlert className="mx-auto mt-5 text-amber-300" size={42} />}
        <h1 className="mt-4 text-3xl font-black text-[var(--gold)]">{state === "pending" ? "Confirming your subscription" : state === "confirmed" ? expectedPlan ? "Subscription confirmed" : "Checkout received" : "Payment not completed"}</h1>
        <p className="mt-4 text-slate-300">{state === "pending" ? "This usually takes a few seconds. Your access updates only after the verified Stripe webhook." : state === "incomplete" ? "Challenge Suite has not received an active subscription confirmation yet. No plan access was granted by this page." : expectedPlan ? "Your verified subscription is ready for plan onboarding." : "Your checkout returned successfully. Account updates still depend on verified webhook processing."}</p>
        <p className="mt-3 text-sm text-slate-400">This page never activates subscriptions or credits DoroCoins by itself.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {state === "confirmed" ? <LinkButton href={destination}>{expectedPlan === "host" ? "Start Host Setup" : expectedPlan === "creator" ? "Start Creator Setup" : "Return to Dashboard"}</LinkButton> : null}
          {state === "incomplete" ? <><LinkButton href="/subscriptions">Try Again</LinkButton><LinkButton href="/subscriptions" variant="secondary">Return to Plans</LinkButton></> : null}
          {state === "pending" ? <LinkButton href="/settings/billing" variant="secondary">View Billing Status</LinkButton> : null}
        </div>
      </Card>
    </main>
  );
}

function CheckoutPending() {
  return <main className="flex min-h-screen items-center justify-center bg-black px-6"><Card className="max-w-xl p-10 text-center"><Clock3 className="mx-auto text-[var(--gold)]" size={42} /><h1 className="mt-4 text-3xl font-black">Confirming checkout</h1><p className="mt-3 text-slate-300">Loading verified account status...</p></Card></main>;
}
