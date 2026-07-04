"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Gamepad2, Megaphone, Trophy } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const options = [
  { id: "user", title: "Competitor", icon: Trophy, copy: "Join challenges, vote, compete, and build your challenge profile." },
  { id: "creator", title: "Creator", icon: Megaphone, copy: "Create challenges, grow an audience, and unlock sponsorship opportunities." },
  { id: "host", title: "Host", icon: Gamepad2, copy: "Run competitions, live events, tournaments, and sponsor-ready challenges." },
  { id: "sponsor", title: "Brand / Sponsor", icon: Building2, copy: "Sponsor challenges, create campaigns, fund prize foundations, and track brand performance." }
] as const;

export default function AccountTypeOnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof options)[number]["id"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function continueOnboarding() {
    if (!selected) return;
    setSaving(true);
    setError("");
    const result = await apiRequest<{ destination: string }>("/api/auth/profile/bootstrap", {
      method: "PATCH",
      body: JSON.stringify({ accountType: selected })
    });
    setSaving(false);
    if (!result.ok || !result.data) {
      setError(result.message || "Account type could not be saved.");
      return;
    }
    router.replace(result.data.destination);
  }

  return (
    <main className="min-h-[100dvh] bg-black px-5 py-10 text-white sm:px-8 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <BrandLogo imageClassName="h-16 w-16 border-2 border-[var(--gold)] gold-glow" />
        <div className="mt-8 max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Account setup</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">How will you use Challenge Suite?</h1>
          <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">Choose the workspace that matches your goals. This selects account intent only and does not grant a paid subscription.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {options.map((option) => {
            const Icon = option.icon;
            const active = selected === option.id;
            return <button key={option.id} type="button" onClick={() => setSelected(option.id)} className={`min-w-0 rounded-[8px] border p-6 text-left transition sm:p-8 ${active ? "border-[var(--gold)] bg-[var(--gold)]/10 gold-glow" : "border-white/10 bg-[#121212] hover:border-[var(--gold)]/50"}`} aria-pressed={active}><div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Icon size={24} /></div><h2 className="mt-5 text-2xl font-black">{option.title}</h2><p className="mt-3 leading-7 text-slate-300">{option.copy}</p><p className="mt-5 text-sm font-black text-[var(--gold)]">{active ? "Selected" : "Choose account type"}</p></button>;
          })}
        </div>
        {error ? <Card className="mt-6 border-red-500/20 bg-red-950/30 p-4 text-red-200">{error}</Card> : null}
        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-400">Brand accounts use a separate Brand Command Center. Full sponsor tools require brand approval and an active sponsor subscription.</p>
          <Button className="w-full sm:w-auto" disabled={!selected || saving} onClick={() => void continueOnboarding()}>{saving ? "Preparing workspace..." : "Continue"}</Button>
        </div>
      </div>
    </main>
  );
}
