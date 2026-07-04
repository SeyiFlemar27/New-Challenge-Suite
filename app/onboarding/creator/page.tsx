"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, LockKeyhole, Rocket, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

export default function CreatorOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [niche, setNiche] = useState("");
  const [profileGoal, setProfileGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });

  async function complete() {
    setSaving(true);
    setError("");
    const result = await apiRequest<{ destination: string }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({ type: "creator", niche, profileGoal })
    });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    router.replace(result.data?.destination ?? "/dashboard");
  }

  if (loading) return <AppShell><Card className="h-96 animate-pulse bg-[#171717]" /></AppShell>;
  if (tier.id !== "creator") {
    return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><LockKeyhole className="mx-auto text-[var(--gold)]" size={44} /><h1 className="mt-5 text-3xl font-black">Creator Plan required</h1><p className="mt-3 text-slate-300">Creator onboarding unlocks after verified Stripe activation of Creator Plan.</p><LinkButton href="/subscriptions" className="mt-6">View Creator Plan</LinkButton></Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageTitle title="Welcome to Creator Plan" subtitle="Set up your creator focus, understand the tools available, and choose your first action." />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Feature icon={<Swords />} title="Challenge tools" body="Create public, private, and sponsor-ready challenges within Creator Plan limits." />
          <Feature icon={<BarChart3 />} title="Creator insights" body="Review submissions and basic creator performance analytics." />
          <Feature icon={<Rocket />} title="Monthly boost" body="Use the Creator monthly boost allowance on an eligible challenge." />
        </div>
        <Card className="mt-7 p-6 sm:p-8">
          <div className="grid gap-6">
            <Field label="Creator niche or category"><input className={inputClass} value={niche} onChange={(event) => setNiche(event.target.value)} placeholder="Fitness, music, design..." /></Field>
            <Field label="What do you want to build?"><input className={inputClass} value={profileGoal} onChange={(event) => setProfileGoal(event.target.value)} placeholder="Grow a competition community..." /></Field>
            <Card className="border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300">Wallet and earnings remain review-only. Upgrade to Host when you need tournaments, live events, participant management, voting controls, reports, and team tools.</Card>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex justify-end"><Button onClick={() => void complete()} disabled={saving}>{saving ? "Saving..." : "Complete Setup & Open Creator Studio"}</Button></div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <Card className="p-5"><span className="text-[var(--gold)]">{icon}</span><h2 className="mt-3 font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></Card>;
}
