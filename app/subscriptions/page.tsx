"use client";

import { useEffect, useState } from "react";
import { Check, Eye, LockKeyhole, Radio, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { ConsentDialog } from "@/components/consent-dialog";
import { money } from "@/lib/utils";
import { createSubscriptionCheckout, fetchSubscriptionPlans } from "@/lib/api/services";
import type { SubscriptionPlan } from "@/lib/types";

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const visiblePlans = plans.filter((plan) => plan.audience === "user" && !["pro", "enterprise"].includes(plan.id));

  async function loadPlans() {
    setLoading(true);
    setError("");
    setUnauthenticated(false);
    const result = await fetchSubscriptionPlans();
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setPlans([]);
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Subscription plans could not be loaded.");
      setLoading(false);
      return;
    }
    setPlans(result.data.plans.filter((plan) => plan.audience === "user"));
    setSignedOut((result.data as any).authenticated === false);
    setLoading(false);
  }

  useEffect(() => { void loadPlans(); }, []);

  async function checkout(planId: string) {
    setLoadingPlan(planId);
    setError("");
    setCheckoutMessage("");
    const result = await createSubscriptionCheckout(planId);
    setLoadingPlan(null);
    if (!result.ok || !result.data?.url) {
      setError(result.message || "Checkout could not be started. Please try again.");
      return;
    }
    setCheckoutMessage((result.data as any).mode === "mock" || (result.data as any).developmentOnly ? result.message || "Development checkout started. No payment will be processed and no subscription will be activated." : "Checkout started. Your plan updates after Stripe webhook confirmation.");
    window.location.href = result.data.url;
  }

  return (
    <AppShell>
      <div className="text-center">
        <PageTitle title="Choose Your Plan" subtitle="Upgrade normal Challenge Suite access for competitors, creators, and hosts." />
      </div>

      {error ? <Card className="mx-auto mt-6 max-w-3xl border-red-500/30 bg-red-950/30 p-4 text-red-100">{error}</Card> : null}
      {checkoutMessage ? <Card className="mx-auto mt-6 max-w-3xl border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-100">{checkoutMessage}</Card> : null}

      {loading ? (
        <div className="mt-14 grid gap-7 md:grid-cols-3">{[1, 2, 3].map((item) => <Card key={item} className="h-[520px] animate-pulse bg-[#10151e]" />)}</div>
      ) : unauthenticated ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to view your current subscription options."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      ) : !visiblePlans.length ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<Swords />} title="No plans available" body="Subscription plans are not available yet." action={<Button onClick={loadPlans}>Retry</Button>} />
        </Card>
      ) : (
        <div className="mx-auto mt-14 grid max-w-[1180px] gap-7 md:grid-cols-3">
          {visiblePlans.map((plan) => (
            <Card key={plan.id} className={`relative p-8 ${plan.recommended ? "border-[var(--gold)] bg-yellow-500/10" : "bg-[#10151e]"}`}>
              {plan.recommended ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gold)] px-7 py-2 text-sm font-bold text-black">Recommended</span> : null}
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gold)]/10 text-[var(--gold)]">{plan.id === "free" ? <Eye size={34} /> : plan.id === "host" ? <Radio size={34} /> : <Swords size={34} />}</div>
              <h2 className="mt-8 text-center text-3xl font-black">{plan.name}</h2>
              <p className="mt-4 text-center text-slate-300">{plan.subtitle}</p>
              <div className="mt-6 text-center text-4xl font-black">{plan.priceMonthlyLabel ?? (plan.priceMonthly !== null ? money(plan.priceMonthly) : "Pricing pending")}</div>
              {plan.id === "free" ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-center text-xs font-bold text-slate-300">1 free vote per challenge/day.</p> : null}
              <div className="my-8 border-t border-white/10" />
              <ul className="space-y-4">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 text-emerald-400" /> {feature}</li>)}</ul>
              <div className="mt-8">
                {signedOut && plan.id !== "free" ? <LinkButton href="/auth/login" className="w-full">Sign In to Choose Plan</LinkButton> : plan.current ? <Button variant="ghost" className="w-full" disabled>Active Plan</Button> : plan.id === "free" ? <Button variant="ghost" className="w-full" disabled>Free Plan</Button> : !plan.purchaseAllowed ? <Button variant="ghost" className="w-full" disabled>Not Available for This Account</Button> : !plan.checkoutAvailable ? <Button variant="ghost" className="w-full" disabled>Stripe Price Not Configured</Button> : <ConsentDialog agreementType="dorocoin" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Select Plan"} onAccepted={() => checkout(plan.id)} />}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mx-auto mt-10 max-w-4xl border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6 text-center">
        <h2 className="text-2xl font-black">Need Enterprise access?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">Enterprise access is available by application for approved teams and in-house operators.</p>
        <LinkButton href="/enterprise/apply" className="mt-5">Apply for Enterprise Access</LinkButton>
      </Card>
    </AppShell>
  );
}
