"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Handshake, LockKeyhole, Radio, ShieldCheck, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { ConsentDialog } from "@/components/consent-dialog";
import { money } from "@/lib/utils";
import { createSubscriptionCheckout, fetchSubscriptionPlans } from "@/lib/api/services";
import type { SubscriptionPlan } from "@/lib/types";
import { getEffectiveTier } from "@/lib/plan-access";

export default function SubscriptionsPage() {
  const [audience, setAudience] = useState<"user" | "sponsor">("user");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<{ status: string; planId: string | null } | null>(null);
  const visiblePlans = plans.filter((plan) => plan.audience === audience);
  const currentTier = getEffectiveTier({ planId: currentSubscription?.planId, planStatus: currentSubscription?.status, accountType: audience === "sponsor" ? "sponsor" : "user" });

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
    setPlans(result.data.plans);
    setCurrentSubscription({ status: result.data.subscriptionStatus, planId: result.data.subscription.planId });
    setAudience(result.data.accountType === "sponsor" ? "sponsor" : "user");
    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "mock-success") {
      setCheckoutMessage("Development checkout completed. No payment was processed and no subscription was activated.");
    }
  }, []);

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
    if ((result.data as any).mode === "mock" || (result.data as any).developmentOnly) {
      setCheckoutMessage(result.message || "Development checkout started. No payment will be processed and no subscription will be activated.");
    } else {
      setCheckoutMessage("Checkout started. Your plan updates after Stripe webhook confirmation.");
    }
    window.location.href = result.data.url;
  }

  return (
    <AppShell>
      <div className="text-center">
        <PageTitle title="Choose Your Plan" subtitle="Blueprint-aligned access for competitors, creators, hosts, enterprises, and sponsors." />
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-[620px] rounded-full bg-[#111] p-2">
        <Button variant={audience === "user" ? "primary" : "ghost"} className="flex-1 rounded-full" onClick={() => setAudience("user")}>Users, Creators & Hosts</Button>
        <Button variant={audience === "sponsor" ? "primary" : "ghost"} className="flex-1 rounded-full" onClick={() => setAudience("sponsor")}>Sponsors & Brands</Button>
      </div>
      <Card className="mx-auto mt-6 max-w-4xl border-yellow-500/20 bg-yellow-500/5 p-4 text-center text-sm leading-6 text-slate-300">
        {audience === "sponsor"
          ? "Sponsor subscriptions unlock sponsor tools and the Brand Command Center. Actual campaign budgets, sponsorship funding, money release, and payouts are separate and are not active in this version."
          : "Paid-entry prize pools remain disabled. Creator, Pro, Host, and Enterprise plans unlock platform tools, not automatic cash payouts."}
      </Card>
      {currentSubscription?.planId ? <Card className="mx-auto mt-4 flex max-w-4xl flex-col gap-4 p-5 text-left sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Current Plan</p><p className="mt-2 text-sm text-slate-300"><b className="text-white">{currentTier.displayName}</b> · <span className="capitalize">{currentSubscription.status.replaceAll("_", " ")}</span></p></div><LinkButton href="/settings/billing" variant="secondary">Manage Billing</LinkButton></Card> : null}
      {error ? <Card className="mx-auto mt-6 max-w-3xl border-red-500/30 bg-red-950/30 p-4 text-red-100">{error}</Card> : null}
      {checkoutMessage ? <Card className="mx-auto mt-6 max-w-3xl border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-100">{checkoutMessage}</Card> : null}
      {loading ? (
        <div className="mt-14 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Card key={item} className="h-[520px] animate-pulse bg-[#10151e]" />)}
        </div>
      ) : unauthenticated ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to view your current subscription options."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      ) : !visiblePlans.length ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<Swords />} title="No plans available" body="Subscription plans are not available for this audience yet." action={<Button onClick={loadPlans}>Retry</Button>} />
        </Card>
      ) : (
      <div className="mt-14 grid gap-7 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {visiblePlans.map((plan) => (
          <Card key={plan.id} className={`relative p-8 ${plan.recommended ? "border-[var(--gold)] bg-yellow-500/10" : "bg-[#10151e]"}`}>
            {plan.recommended ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gold)] px-7 py-2 text-sm font-bold text-black">Recommended</span> : null}
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gold)]/10 text-[var(--gold)]">{plan.audience === "sponsor" ? <Handshake size={34} /> : plan.id === "free" ? <Eye size={34} /> : plan.id === "host" || plan.id === "enterprise" ? <Radio size={34} /> : <Swords size={34} />}</div>
            <h2 className="mt-8 text-center text-3xl font-black">{plan.name}</h2>
            <p className="mt-4 text-center text-slate-300">{plan.subtitle}</p>
            <div className="mt-6 text-center text-4xl font-black">{plan.priceMonthlyLabel ?? (plan.priceMonthly !== null ? money(plan.priceMonthly) : "Pricing pending")}</div>
            {plan.audience === "sponsor" ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-center text-xs font-bold text-slate-300">Sponsor tools only. Campaign budget is separate.</p> : null}
            {plan.id === "free" ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-center text-xs font-bold text-slate-300">1 free vote per challenge/day.</p> : null}
            <div className="my-8 border-t border-white/10" />
            <ul className="space-y-4">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 text-emerald-400" /> {feature}</li>)}</ul>
            {plan.canCreatePrizeChallenges ? <p className="mt-5 flex gap-2 rounded-[8px] bg-yellow-500/5 p-3 text-xs text-slate-300"><ShieldCheck size={15} className="shrink-0 text-[var(--gold)]" /> Sponsor-funded prize tooling only. Paid-entry prize pools are disabled.</p> : null}
            <div className="mt-8">
              {plan.current ? <Button variant="ghost" className="w-full" disabled>Current Plan</Button> : plan.id === "free" ? <Button variant="ghost" className="w-full" disabled>Free Plan</Button> : !plan.purchaseAllowed ? <Button variant="ghost" className="w-full" disabled>Not Available for This Account</Button> : !plan.checkoutAvailable ? <Button variant="ghost" className="w-full" disabled>Stripe Price Not Configured</Button> : plan.audience === "sponsor" ? <ConsentDialog agreementType="sponsor" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Select Sponsor Plan"} onAccepted={() => checkout(plan.id)} /> : <ConsentDialog agreementType="dorocoin" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Select Plan"} onAccepted={() => checkout(plan.id)} />}
            </div>
          </Card>
        ))}
      </div>
      )}
    </AppShell>
  );
}
