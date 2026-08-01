"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, LayoutDashboard, Trophy, UserRound, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { apiRequest } from "@/lib/api/client";
import { getEffectiveTier } from "@/lib/plan-access";

type TourStep = { title: string; body: string; icon: typeof Compass };

const competitorSteps: TourStep[] = [
  { title: "Welcome to Challenge Suite", body: "Your home for structured challenges, community voting, rankings, and achievement.", icon: LayoutDashboard },
  { title: "Explore challenges", body: "Discover active competitions, follow creators, and save challenges you want to revisit.", icon: Compass },
  { title: "Compete and vote", body: "Join eligible challenges, submit entries, vote, and follow your progress from My Entries.", icon: Trophy },
  { title: "DoroCoin wallet", body: "Use internal platform credits for eligible votes and promotional features. DoroCoins are not cash.", icon: WalletCards },
  { title: "Build your profile", body: "Show your entries, wins, badges, and community identity from your public profile.", icon: UserRound }
];
const creatorSteps: TourStep[] = [
  competitorSteps[0],
  { title: "Create your first challenge", body: "Launch a challenge from the guided builder while money features remain review-safe.", icon: Trophy },
  { title: "Manage submissions", body: "Track your challenges and review the entries they receive from one focused workspace.", icon: LayoutDashboard },
  { title: "Grow with creator tools", body: "Use your profile, creator analytics, and challenge history to build a recognizable community.", icon: UserRound }
];
const hostSteps: TourStep[] = [
  { title: "Welcome to Host Control Center", body: "Run competitions with participant, submission, voting, and reporting tools.", icon: LayoutDashboard },
  { title: "Build competitions", body: "Configure formats, rounds, registration, voting, judging, media, and sponsor readiness.", icon: Trophy },
  { title: "Manage participants", body: "Review registration and participant status across the competitions you own.", icon: UserRound },
  { title: "Control voting", body: "Monitor voting windows, visibility, totals, and review-safe controls.", icon: WalletCards },
  { title: "Review reports", body: "Prepare operational reports without fake exports or financial execution.", icon: Compass }
];
const sponsorSteps: TourStep[] = [
  { title: "Welcome to Brand Command Center", body: "Complete your brand profile, pass review, and activate a sponsor plan before campaign tools unlock.", icon: LayoutDashboard },
  { title: "Complete your brand profile", body: "Add your identity, categories, CTA defaults, and submit your profile for review.", icon: UserRound },
  { title: "Choose sponsor access", body: "Sponsor subscriptions unlock platform tools. Campaign and prize budgets remain separate.", icon: WalletCards },
  { title: "Sponsor with confidence", body: "Organize campaign collaboration without automatic sponsor money or prize release.", icon: Trophy }
];

export function ProductWalkthrough() {
  const { user, loading } = useCurrentUser();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const steps = useMemo(
    () =>
      user?.accountType === "sponsor"
        ? sponsorSteps
        : user?.selectedAccountType === "host" || tier.id === "host"
          ? hostSteps
          : user?.selectedAccountType === "creator" ||
              ["creator_starter", "creator"].includes(tier.id)
            ? creatorSteps
            : competitorSteps,
    [tier.id, user?.accountType, user?.selectedAccountType]
  );

  useEffect(() => {
    setOpen(!loading && Boolean(user?.verified && user.walkthroughCompleted === false && user.selectedAccountType));
  }, [loading, user?.selectedAccountType, user?.verified, user?.walkthroughCompleted]);

  async function finish() {
    setSaving(true);
    const result = await apiRequest<{ completed: boolean }>("/api/onboarding/walkthrough", { method: "PATCH", body: JSON.stringify({}) });
    setSaving(false);
    if (result.ok) setOpen(false);
  }

  if (!open) return null;
  const current = steps[step];
  const Icon = current.icon;
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
      <section className="w-full max-w-xl rounded-[8px] border border-[var(--gold)]/30 bg-[#101010] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)] text-black"><Icon size={22} /></div>
          <button type="button" onClick={() => void finish()} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 text-slate-300" aria-label="Skip product tour"><X size={19} /></button>
        </div>
        <p className="mt-7 text-xs font-black uppercase text-[var(--gold)]">Quick tour - {step + 1} of {steps.length}</p>
        <h2 id="walkthrough-title" className="mt-3 text-2xl font-black sm:text-3xl">{current.title}</h2>
        <p className="mt-4 text-base leading-7 text-slate-300">{current.body}</p>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={17} /> Back</Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => void finish()} disabled={saving}>Skip</Button>
            {step < steps.length - 1
              ? <Button onClick={() => setStep((value) => value + 1)}>Next <ArrowRight size={17} /></Button>
              : <Button onClick={() => void finish()} disabled={saving}><CheckCircle2 size={17} /> {saving ? "Finishing..." : "Finish Tour"}</Button>}
          </div>
        </div>
      </section>
    </div>
  );
}
