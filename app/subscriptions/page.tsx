"use client";

import { useEffect, useState } from "react";
import { Check, Eye, LockKeyhole, Radio, ShieldCheck, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { ConsentDialog } from "@/components/consent-dialog";
import { money } from "@/lib/utils";
import { createSubscriptionCheckout, fetchSubscriptionPlans } from "@/lib/api/services";
import type { SubscriptionPlan } from "@/lib/types";
import { getEffectiveTier } from "@/lib/plan-access";

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<{ status: string; planId: string | null } | null>(null);
  const visiblePlans = plans.filter((plan) => plan.audience === "user" && plan.id !== "pro");
  const currentTier = getEffectiveTier({ planId: currentSubscription?.planId, planStatus: currentSubscription?.status, accountType: "user" });

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
    setCurrentSubscription({ status: result.data.subscriptionStatus, planId: result.data.subscription.planId });
    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "mock-success") setCheckoutMessage("Development checkout completed. No payment was processed and no subscription was activated.");
  }, []);

  async function checkout(planId: string) {
    setLoadingPlan(planId);
    setError("");
    setCheckoutMessage("");
    const result = await createSubscriptionCheckout(planId);
    setLoadingPlan(null);
    if (!result.ok || !result.data?.url) { setError(result.message || "Checkout could not be started. Please try again."); return; }
    setCheckoutMessage((result.data as any).mode === "mock" || (result.data as any).developmentOnly ? result.message || "Development checkout started. No payment will be processed and no subscription will be activated." : "Checkout started. Your plan updates after Stripe webhook confirmation.");
    window.location.href = result.data.url;
  }

  return <AppShell><div className="text-center"><PageTitle title="Choose Your Plan" subtitle="Upgrade normal Challenge Suite access for competitors, creators, hosts, and enterprise teams." /></div>
    <Card className="mx-auto mt-6 max-w-4xl border-yellow-500/20 bg-yellow-500/5 p-4 text-center text-sm leading-6 text-slate-300">Creator, Host, and Enterprise plans unlock platform tools. Paid-entry prize pools and automatic cash payouts remain disabled.</Card>
    <Card className="mx-auto mt-4 max-w-4xl border-white/10 bg-white/[0.03] p-4 text-center text-sm leading-6 text-slate-300">Looking for brand sponsorship tools? Start a sponsor profile from your account menu, then choose a sponsor plan inside the Sponsor Center.</Card>
    {currentSubscription?.planId ? <Card className="mx-auto mt-4 flex max-w-4xl flex-col gap-4 p-5 text-left sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Current Plan</p><p className="mt-2 text-sm text-slate-300"><b className="text-white">{currentTier.displayName}</b> · <span className="capitalize">{currentSubscription.status.replaceAll("_", " ")}</span></p></div><LinkButton href="/settings/billing" variant="secondary">Manage Billing</LinkButton></Card> : null}
    {error ? <Card className="mx-auto mt-6 max-w-3xl border-red-500/30 bg-red-950/30 p-4 text-red-100">{error}</Card> : null}
    {checkoutMessage ? <Card className="mx-auto mt-6 max-w-3xl border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-100">{checkoutMessage}</Card> : null}
    {loading ? <div className="mt-14 grid gap-7 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Card key={item} className="h-[520px] animate-pulse bg-[#10151e]" />)}</div> : unauthenticated ? <Card className="mx-auto mt-14 max-w-3xl"><EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to view your current subscription options."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} /></Card> : !visiblePlans.length ? <Card className="mx-auto mt-14 max-w-3xl"><EmptyState icon={<Swords />} title="No plans available" body="Subscription plans are not available yet." action={<Button onClick={loadPlans}>Retry</Button>} /></Card> : <div className="mx-auto mt-14 grid max-w-[1500px] gap-7 md:grid-cols-2 xl:grid-cols-4">{visiblePlans.map((plan) => <Card key={plan.id} className={`relative p-8 ${plan.recommended ? "border-[var(--gold)] bg-yellow-500/10" : "bg-[#10151e]"}`}>{plan.recommended ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gold)] px-7 py-2 text-sm font-bold text-black">Recommended</span> : null}<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gold)]/10 text-[var(--gold)]">{plan.id === "free" ? <Eye size={34} /> : plan.id === "host" || plan.id === "enterprise" ? <Radio size={34} /> : <Swords size={34} />}</div><h2 className="mt-8 text-center text-3xl font-black">{plan.name}</h2><p className="mt-4 text-center text-slate-300">{plan.subtitle}</p><div className="mt-6 text-center text-4xl font-black">{plan.priceMonthlyLabel ?? (plan.priceMonthly !== null ? money(plan.priceMonthly) : "Pricing pending")}</div>{plan.id === "free" ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-center text-xs font-bold text-slate-300">1 free vote per challenge/day.</p> : null}<div className="my-8 border-t border-white/10" /><ul className="space-y-4">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 text-emerald-400" /> {feature}</li>)}</ul>{plan.canCreatePrizeChallenges ? <p className="mt-5 flex gap-2 rounded-[8px] bg-yellow-500/5 p-3 text-xs text-slate-300"><ShieldCheck size={15} className="shrink-0 text-[var(--gold)]" /> Sponsor-funded prize tooling only. Paid-entry prize pools are disabled.</p> : null}<div className="mt-8">{signedOut && plan.id !== "free" ? <LinkButton href="/auth/login" className="w-full">Sign In to Choose Plan</LinkButton> : plan.current ? <Button variant="ghost" className="w-full" disabled>Current Plan</Button> : plan.id === "free" ? <Button variant="ghost" className="w-full" disabled>Free Plan</Button> : !plan.purchaseAllowed ? <Button variant="ghost" className="w-full" disabled>Not Available for This Account</Button> : plan.id === "enterprise" ? <LinkButton href="/contact-sales" className="w-full">Contact Sales</LinkButton> : !plan.checkoutAvailable ? <Button variant="ghost" className="w-full" disabled>Stripe Price Not Configured</Button> : <ConsentDialog agreementType="dorocoin" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Select Plan"} onAccepted={() => checkout(plan.id)} />}</div></Card>)}</div>}
  </AppShell>;
}
