"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Handshake, Info, ShieldCheck } from "lucide-react";
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

  useEffect(() => {
    void fetchSubscriptionPlans().then((result) => {
      if (result.ok && result.data) {
        if (result.data.accountType !== "sponsor") setError("A Brand / Sponsor account is required to choose sponsor plans.");
        else setPlans(result.data.plans.filter((plan) => plan.audience === "sponsor"));
      } else setError(result.message || "Sponsor plans could not be loaded.");
      setLoading(false);
    });
  }, []);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  async function checkout(planId: string) {
    setLoadingPlan(planId);
    setError("");
    const result = await createSubscriptionCheckout(planId);
    setLoadingPlan(null);
    if (!result.ok || !result.data?.url) { setError(result.message || "Sponsor checkout could not be started."); return; }
    if ((result.data as any).mode === "mock") setMessage("Development checkout only. No subscription was activated.");
    window.location.href = result.data.url;
  }

  return <SponsorShell>
    <div className="mx-auto max-w-7xl">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor Plans</p>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl lg:text-5xl">Brand access without budget confusion</h1>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">Sponsor subscriptions unlock platform tools. Campaign sponsorship budgets, prize contributions, boosts, placements, and platform fees are separate and are not the same as subscription payments.</p>
      <Card className="mt-7 border-yellow-500/20 bg-yellow-500/5 p-5 text-sm leading-6 text-slate-300"><ShieldCheck className="text-[var(--gold)]" /><p className="mt-3 font-bold text-white">Brand approval and an active or trialing sponsor subscription are both required for full sponsor tools. Checkout never approves a brand and never moves campaign funds.</p></Card>
      {error ? <Card className="mt-6 border-red-500/20 bg-red-950/30 p-4 text-red-200">{error}</Card> : null}
      {message ? <Card className="mt-6 p-4 text-slate-200">{message}</Card> : null}

      {loading ? <div className="mt-10 grid gap-6 lg:grid-cols-3">{[1, 2, 3].map((item) => <Card key={item} className="h-[420px] animate-pulse bg-[#171717]" />)}</div> : <div className="mt-10 grid gap-6 lg:grid-cols-3">{sponsorPlanCards.map((card) => {
        const plan = planMap.get(card.id);
        const enterpriseContactSales = card.checkout === "sales";
        return <Card key={card.id} className={`flex flex-col p-6 sm:p-8 ${card.featured ? "border-[var(--gold)]" : ""}`}><div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Handshake /></div><p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{card.positioning}</p><h2 className="mt-3 text-2xl font-black">{card.name}</h2><p className="mt-2 min-h-14 text-sm leading-6 text-slate-300">{card.summary}</p><p className="mt-5 text-2xl font-black">{enterpriseContactSales ? "Contact Sales" : plan?.priceMonthlyLabel || "Plan pricing managed in Stripe"}</p><ul className="mt-6 flex-1 space-y-3">{card.highlights.map((feature) => <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-300"><Check size={17} className="mt-1 shrink-0 text-emerald-300" />{feature}</li>)}</ul><div className="mt-8">{plan?.current ? <Button className="w-full" disabled>Current Plan</Button> : enterpriseContactSales ? <LinkButton href="/contact-sales" variant="secondary" className="w-full">Contact Sales</LinkButton> : !plan?.checkoutAvailable ? <Button className="w-full" disabled>Stripe Price Not Configured</Button> : <ConsentDialog agreementType="sponsor" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : card.cta} onAccepted={() => checkout(plan.id)} />}</div></Card>;
      })}</div>}

      <section className="mt-12"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Comparison</p><h2 className="mt-2 text-2xl font-black">View full comparison</h2></div><Info className="hidden text-[var(--gold)] sm:block" /></div><div className="mt-5 overflow-x-auto rounded-[8px] border border-white/10"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-[#111]"><tr>{["Capability", ...sponsorPlanCards.map((plan) => plan.name)].map((head) => <th key={head} className="p-4 font-black text-white">{head}</th>)}</tr></thead><tbody>{comparisonRows.map((row) => <tr key={row.label} className="border-t border-white/10"><td className="p-4 font-bold text-slate-200">{row.label}</td>{row.values.map((value, index) => <td key={`${row.label}-${index}`} className="p-4 text-slate-300">{value}</td>)}</tr>)}</tbody></table></div></section>

      <section className="mt-12 grid gap-5 lg:grid-cols-3">{faq.map((item) => <Card key={item.q} className="p-5"><h3 className="font-black">{item.q}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{item.a}</p></Card>)}</section>
    </div>
  </SponsorShell>;
}

const comparisonRows = [
  { label: "Active sponsored challenges/month", values: ["Up to 5", "Up to 20", "Unlimited"] },
  { label: "Campaign brief builder", values: ["Basic tools", "Advanced tools", "Custom program"] },
  { label: "Creator discovery", values: ["Browse tools", "Advanced filters", "Unlimited collaboration"] },
  { label: "Branding placements", values: ["Logo + one CTA", "Leaderboard/voting/winner branding", "Premium homepage and naming rights"] },
  { label: "Analytics", values: ["Basic campaign metrics", "Advanced engagement and cost metrics", "Custom KPI dashboard"] },
  { label: "Team", values: ["1 member", "5 members", "Unlimited members"] },
  { label: "Support", values: ["Email support", "Priority support", "Dedicated account manager"] }
];

const faq = [
  { q: "Is sponsor subscription the same as campaign budget?", a: "No. Subscription unlocks platform tools. Sponsorship funds, prize contributions, boosts, and placements are separate reviewed budgets." },
  { q: "Does checkout verify my brand?", a: "No. Brand verification is a separate review. Approved status can unlock verified branding where plan and safety rules allow." },
  { q: "Can Enterprise Partner checkout directly?", a: "No. Enterprise Partner uses Contact Sales so contract, invoicing, compliance, and activation needs can be reviewed first." }
];








