"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Onboarding = {
  subscription: { active: boolean; providerConfirmed: boolean; planName: string; status: string; billingCycle: string; amountCents: number | null; currency: string; paymentReference: string | null; subscriptionReference: string | null; activationDate: string | null; nextRenewalDate: string | null; paymentMethod: string };
  user: { firstName: string; accountType: string };
  checklist: { subscriptionActivated: boolean; identityVerification: boolean; identityStatus: string; profileComplete: boolean; payoutMethodComplete: boolean; firstChallengeComplete: boolean };
  dashboardHref: string;
};

export default function PremiumOnboardingPage() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    const result = await apiRequest<Onboarding>("/api/onboarding/premium");
    if (result.ok && result.data) { setData(result.data); setError(""); } else setError(result.message || "Membership status could not be loaded.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  return <AppShell><main className="mx-auto max-w-5xl">
    {loading ? <Card className="h-72 animate-pulse" aria-label="Loading verified membership status" /> : error || !data ? <Card className="p-7"><h1 className="text-3xl font-black">Membership status unavailable</h1><p className="mt-3 text-red-200">{error}</p><Button className="mt-5" onClick={() => void load()}>Retry</Button></Card> : !data.subscription.active || !data.subscription.providerConfirmed ? <Pending data={data} refresh={load} /> : <Activated data={data} />}
  </main></AppShell>;
}

function Pending({ data, refresh }: { data: Onboarding; refresh: () => Promise<void> }) {
  return <><h1 className="text-3xl font-black sm:text-4xl">Confirming your membership</h1><p className="mt-4 max-w-2xl leading-7 text-slate-300">Your provider-confirmed subscription record is still being synchronized. Access will update after server verification.</p><Card className="mt-7 p-6"><Summary label="Subscription status" value={label(data.subscription.status)} /><Button className="mt-5" variant="secondary" onClick={() => void refresh()}>Refresh Status</Button></Card></>;
}

function Activated({ data }: { data: Onboarding }) {
  const rows = [
    ["Plan name", data.subscription.planName],
    ["Billing cycle", label(data.subscription.billingCycle)],
    ["Amount paid", data.subscription.amountCents === null ? "Recorded by provider" : money(data.subscription.amountCents, data.subscription.currency)],
    ["Currency", data.subscription.currency],
    ["Payment reference", data.subscription.paymentReference || "Recorded by provider"],
    ["Subscription reference", data.subscription.subscriptionReference || "Recorded by provider"],
    ["Activation date", date(data.subscription.activationDate)],
    ["Next renewal date", date(data.subscription.nextRenewalDate)],
    ["Payment method", data.subscription.paymentMethod],
    ["Subscription status", label(data.subscription.status)]
  ];
  const checks = [
    ["Subscription activated", true, "Completed"],
    ["Identity verification", data.checklist.identityVerification, data.checklist.identityVerification ? "Completed" : "Required"],
    ["Creator/Host profile", data.checklist.profileComplete, data.checklist.profileComplete ? "Completed" : "Incomplete"],
    ["Payout method", data.checklist.payoutMethodComplete, data.checklist.payoutMethodComplete ? "Completed" : "Incomplete"],
    ["First challenge", data.checklist.firstChallengeComplete, data.checklist.firstChallengeComplete ? "Completed" : "Not created"]
  ] as const;
  return <><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Membership onboarding</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Welcome to the {data.subscription.planName}, {data.user.firstName}</h1><p className="mt-4 max-w-3xl leading-7 text-slate-300">Your payment has been confirmed and your membership is active.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><Card className="p-6"><h2 className="text-xl font-black">Purchase summary</h2><dl className="mt-5 divide-y divide-white/10">{rows.map(([name, value]) => <div key={name} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-sm text-slate-400">{name}</dt><dd className="break-words font-bold">{value}</dd></div>)}</dl></Card>
      <Card className="p-6"><h2 className="text-xl font-black">Recommended setup</h2><ol className="mt-5 space-y-3">{checks.map(([name, complete, status], index) => <li key={name} className="flex items-center justify-between gap-4 rounded-[8px] border border-white/10 p-4"><span className="font-bold">{index + 1}. {name}</span><span className={complete ? "text-sm font-black text-emerald-300" : "text-sm font-black text-yellow-200"}>{status}</span></li>)}</ol></Card></div>
    <Card className="mt-6 p-5"><p className="text-sm leading-6 text-slate-300">You can continue using Challenge Suite. Identity verification is required before creating paid challenges or withdrawing earnings.</p></Card>
    <div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/kyc/status">Continue Identity Verification</LinkButton><LinkButton href={data.dashboardHref} variant="secondary">Finish Later</LinkButton></div>
  </>;
}
function Summary({ label: name, value }: { label: string; value: string }) { return <div><p className="text-xs font-black uppercase text-slate-500">{name}</p><p className="mt-2 font-black">{value}</p></div>; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function date(value: string | null) { return value ? new Date(value).toLocaleDateString() : "Recorded by provider"; }
function money(cents: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }