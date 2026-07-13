"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, Compass, LockKeyhole, Rocket, Swords, WalletCards } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Button, Card, Field, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

const unlockedTools = [
  "Creator Studio",
  "Create Challenge",
  "My Challenges",
  "Submission review",
  "Creator analytics tools",
  "Monthly boosts",
  "Wallet and earnings review"
];

export default function CreatorOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ niche: "", profileGoal: "", challengeType: "Community challenge", audience: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function complete(destination: string) {
    setSaving(true);
    setError("");
    const result = await apiRequest<{ destination: string }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({ type: "creator", niche: form.niche, profileGoal: form.profileGoal })
    });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    router.replace(destination);
  }

  if (loading) return <OnboardingShell eyebrow="Creator Plan" title="Preparing your studio" subtitle="Loading your verified plan access." currentStep={1} totalSteps={4}><Card className="h-[480px] animate-pulse" /></OnboardingShell>;
  if (tier.id !== "creator") {
    return <OnboardingShell eyebrow="Plan verification" title="Creator Plan required" subtitle="Creator onboarding opens only after verified Stripe activation." currentStep={1} totalSteps={4}><Card className="p-8 text-center"><LockKeyhole className="mx-auto text-[var(--gold)]" size={44} /><p className="mt-5 text-slate-300">Your existing account access remains unchanged.</p><LinkButton href="/subscriptions" className="mt-6">View Creator Plan</LinkButton></Card></OnboardingShell>;
  }

  return (
    <OnboardingShell
      eyebrow="Creator Plan activated"
      title={step === 1 ? "Welcome to Creator Plan" : step === 2 ? "Shape your creator focus" : step === 3 ? "Your creator toolkit" : "Choose your first move"}
      subtitle={step === 1 ? "You can now launch sponsor-ready challenges, manage entries, review submissions, and grow your competition community." : "A focused setup keeps Creator Studio relevant to the community you want to build."}
      currentStep={step}
      totalSteps={4}
    >
      {step === 1 ? <div className="grid gap-4 sm:grid-cols-2">
        <AccessCard icon={<Swords />} title="Challenge creation" body="Create public and eligible private challenges within Creator Plan limits." />
        <AccessCard icon={<Compass />} title="Community participation" body="Keep exploring, joining, voting, saving, and tracking your own entries." />
        <AccessCard icon={<BarChart3 />} title="Creator performance" body="Review submissions and creator analytics from your studio." />
        <AccessCard icon={<Rocket />} title="Monthly boost" body="Use your included monthly boost on an eligible challenge." />
        <Card className="border-yellow-500/20 bg-yellow-500/5 p-5 sm:col-span-2"><div className="flex items-start gap-3"><WalletCards className="mt-0.5 shrink-0 text-[var(--gold)]" /><p className="text-sm leading-6 text-slate-300">Wallet and earnings remain review-only. Withdrawals and payouts are not active.</p></div></Card>
      </div> : null}

      {step === 2 ? <Card className="p-6 sm:p-8"><div className="grid gap-6">
        <Field label="Creator niche or category"><input className={inputClass} value={form.niche} onChange={(event) => update("niche", event.target.value)} placeholder="Fitness, music, design..." /></Field>
        <Field label="What do you want to build?"><input className={inputClass} value={form.profileGoal} onChange={(event) => update("profileGoal", event.target.value)} placeholder="A trusted competition community..." /></Field>
        <Field label="Primary challenge type"><select className={inputClass} value={form.challengeType} onChange={(event) => update("challengeType", event.target.value)}><option>Community challenge</option><option>Creative showcase</option><option>Skill competition</option><option>Educational challenge</option></select></Field>
        <Field label="Audience or community"><input className={inputClass} value={form.audience} onChange={(event) => update("audience", event.target.value)} placeholder="Who do you want to bring together?" /></Field>
      </div></Card> : null}

      {step === 3 ? <Card className="p-6 sm:p-8"><div className="grid gap-3 sm:grid-cols-2">{unlockedTools.map((tool) => <div key={tool} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.025] px-4"><Check size={17} className="shrink-0 text-[var(--gold)]" /><span className="font-bold">{tool}</span></div>)}</div><p className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-slate-400">Tournament, live-event, participant, and advanced voting controls remain Host tools.</p></Card> : null}

      {step === 4 ? <div className="grid gap-4">
        <ActionCard title="Create your first challenge" body="Start with the Creator challenge builder." href="/challenges/create" onChoose={() => void complete("/challenges/create")} />
        <ActionCard title="Open Creator Studio" body="Review your dashboard, challenges, submissions, and performance." href="/dashboard" onChoose={() => void complete("/dashboard")} />
        <ActionCard title="Explore challenges" body="Keep participating while you build your creator presence." href="/challenges" onChoose={() => void complete("/challenges")} />
      </div> : null}

      {error ? <p className="mt-5 rounded-[8px] border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</p> : null}
      {step < 4 ? <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="ghost" disabled={step === 1} onClick={() => setStep((value) => value - 1)}>Back</Button><Button onClick={() => setStep((value) => value + 1)} disabled={step === 2 && (form.niche.trim().length < 2 || form.profileGoal.trim().length < 2)}>Continue</Button></div> : null}
      {step === 4 && saving ? <p className="mt-5 text-sm text-slate-400">Saving your Creator setup...</p> : null}
    </OnboardingShell>
  );
}

function AccessCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <Card className="p-5 sm:p-6"><span className="text-[var(--gold)]">{icon}</span><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></Card>;
}

function ActionCard({ title, body, href, onChoose }: { title: string; body: string; href: string; onChoose: () => void }) {
  return <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div><Button onClick={onChoose} className="shrink-0">{href === "/dashboard" ? "Open Studio" : href === "/challenges" ? "Explore" : "Start Creating"}</Button></Card>;
}
