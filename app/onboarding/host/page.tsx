"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

const hostTypes = ["Online challenges", "Live events", "Tournaments", "School competitions", "Talent shows", "Pageants", "Sports competitions", "Business pitch competitions", "Community contests", "Other"];

export default function HostOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [form, setForm] = useState({ organizationName: "", eventBrandName: "", location: "", contactEmail: user?.email ?? "", publicProfileUrl: "", logoUrl: "", hostType: "Online challenges", competitionSize: "under_50", votingPreference: "public", eventMode: "online", revenueAcknowledged: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const update = (field: string, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  async function complete() {
    setSaving(true);
    setError("");
    const result = await apiRequest<{ destination: string }>("/api/onboarding", { method: "POST", body: JSON.stringify({ type: "host", ...form, contactEmail: form.contactEmail || user?.email || "" }) });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    router.replace(result.data?.destination ?? "/dashboard/host");
  }

  if (loading) return <AppShell><Card className="h-96 animate-pulse bg-[#171717]" /></AppShell>;
  if (tier.id !== "host") {
    return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><LockKeyhole className="mx-auto text-[var(--gold)]" size={44} /><h1 className="mt-5 text-3xl font-black">Host Plan required</h1><p className="mt-3 text-slate-300">Host onboarding unlocks after verified Stripe activation of Host Plan.</p><LinkButton href="/subscriptions" className="mt-6">Upgrade to Host</LinkButton></Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Host Plan</p>
        <PageTitle title="Welcome to Host Plan" subtitle="You can now run serious competitions, manage participants, control voting, create live events, and review competition reports." />
        <Card className="mt-8 p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Host or organization name"><input className={inputClass} value={form.organizationName} onChange={(event) => update("organizationName", event.target.value)} /></Field>
            <Field label="Event brand name"><input className={inputClass} value={form.eventBrandName} onChange={(event) => update("eventBrandName", event.target.value)} /></Field>
            <Field label="Country or location"><input className={inputClass} value={form.location} onChange={(event) => update("location", event.target.value)} /></Field>
            <Field label="Contact email"><input className={inputClass} type="email" value={form.contactEmail || user?.email || ""} onChange={(event) => update("contactEmail", event.target.value)} /></Field>
            <Field label="Public host profile URL"><input className={inputClass} value={form.publicProfileUrl} onChange={(event) => update("publicProfileUrl", event.target.value)} placeholder="https://..." /></Field>
            <Field label="Logo or avatar URL"><input className={inputClass} value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." /></Field>
            <Field label="Host type"><select className={inputClass} value={form.hostType} onChange={(event) => update("hostType", event.target.value)}>{hostTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Typical competition size"><select className={inputClass} value={form.competitionSize} onChange={(event) => update("competitionSize", event.target.value)}><option value="under_50">Under 50</option><option value="50_200">50-200</option><option value="200_1000">200-1,000</option><option value="1000_plus">1,000+</option></select></Field>
            <Field label="Voting and judging preference"><select className={inputClass} value={form.votingPreference} onChange={(event) => update("votingPreference", event.target.value)}><option value="public">Public voting</option><option value="dorocoin">DoroCoin voting</option><option value="judge">Judge review</option><option value="hybrid">Hybrid voting + judges</option><option value="manual">Manual winner confirmation</option></select></Field>
            <Field label="Event mode"><select className={inputClass} value={form.eventMode} onChange={(event) => update("eventMode", event.target.value)}><option value="online">Online only</option><option value="physical">Physical / in-person only</option><option value="hybrid">Hybrid</option><option value="unsure">Not sure yet</option></select></Field>
          </div>
          <label className="mt-7 flex items-start gap-3 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300"><input className="mt-1" type="checkbox" checked={form.revenueAcknowledged} onChange={(event) => update("revenueAcknowledged", event.target.checked)} /><span>Challenge Suite can track entry activity, vote activity, sponsor interest, and event revenue foundations. Withdrawals, automatic payouts, refunds, and prize-pool releases are not active yet.</span></label>
          {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
          <div className="mt-7 flex justify-end"><Button onClick={() => void complete()} disabled={saving || !form.revenueAcknowledged}><ShieldCheck size={17} /> {saving ? "Saving..." : "Complete Setup & Open Host Controls"}</Button></div>
        </Card>
      </div>
    </AppShell>
  );
}
