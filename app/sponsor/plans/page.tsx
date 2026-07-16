"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Handshake } from "lucide-react";
import { ConsentDialog } from "@/components/consent-dialog";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { createSubscriptionCheckout, fetchSubscriptionPlans } from "@/lib/api/services";
import { sponsorPlanCards } from "@/lib/sponsor-foundation";
import type { SubscriptionPlan } from "@/lib/types";

export default function SponsorPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void fetchSubscriptionPlans().then((result) => { if (result.ok && result.data) { if (result.data.accountType !== "sponsor") setError("A Brand / Sponsor account is required to choose sponsor plans."); else setPlans(result.data.plans.filter((plan) => plan.audience === "sponsor")); } else setError(result.message || "Sponsor plans could not be loaded."); setLoading(false); }); }, []);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  async function checkout(planId: string) { setLoadingPlan(planId); setError(""); const result = await createSubscriptionCheckout(planId); setLoadingPlan(null); if (!result.ok || !result.data?.url) { setError(result.message || "Sponsor checkout could not be started."); return; } if ((result.data as any).mode === "mock") setMessage("Development checkout only. No subscription was activated."); window.location.href = result.data.url; }

  return <SponsorShell><div className="mx-auto max-w-7xl"><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor Plans</p><h1 className="mt-3 text-3xl font-black sm:text-4xl lg:text-5xl">Choose sponsor access</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">Sponsor subscriptions unlock platform tools. Campaign budgets and prize contributions are handled separately.</p>{error ? <Card className="mt-6 border-red-500/20 bg-red-950/30 p-4 text-red-200">{error}</Card> : null}{message ? <Card className="mt-6 p-4 text-slate-200">{message}</Card> : null}
    {loading ? <div className="mt-10 grid gap-6 lg:grid-cols-3">{[1, 2, 3].map((item) => <Card key={item} className="h-[360px] animate-pulse bg-[#171717]" />)}</div> : <div className="mt-10 grid gap-6 lg:grid-cols-3">{sponsorPlanCards.map((card) => { const plan = planMap.get(card.id); const enterpriseContactSales = card.checkout === "sales"; return <Card key={card.id} className={`flex flex-col p-6 sm:p-8 ${card.featured ? "border-[var(--gold)]" : ""}`}><div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Handshake /></div><p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{card.positioning}</p><h2 className="mt-3 text-2xl font-black">{card.name}</h2><p className="mt-2 min-h-14 text-sm leading-6 text-slate-300">{card.summary}</p><p className="mt-5 text-2xl font-black">{enterpriseContactSales ? "Custom pricing" : plan?.priceMonthlyLabel || "Stripe price not configured"}</p><ul className="mt-6 flex-1 space-y-3">{card.highlights.slice(0, 5).map((feature) => <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-300"><Check size={17} className="mt-1 shrink-0 text-emerald-300" />{feature}</li>)}</ul><div className="mt-8">{plan?.current ? <Button className="w-full" disabled>Current Plan</Button> : enterpriseContactSales ? <LinkButton href="/contact-sales" variant="secondary" className="w-full">Contact Sales</LinkButton> : !plan?.checkoutAvailable ? <Button className="w-full" disabled>Stripe price not configured</Button> : <ConsentDialog agreementType="sponsor" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : card.cta} onAccepted={() => checkout(plan.id)} />}</div></Card>; })}</div>}
  </div></SponsorShell>;
}
