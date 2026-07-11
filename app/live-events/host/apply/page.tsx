"use client";

import { LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

export default function HostAccessPage() {
  const { user, loading } = useCurrentUser();
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  if (loading) return <AppShell><Card className="h-80 animate-pulse bg-[#171717]" /></AppShell>;

  if (tier.id === "host") {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <ShieldCheck className="mx-auto text-[var(--gold)]" size={46} />
          <h1 className="mt-5 text-3xl font-black">Host Plan active</h1>
          <p className="mt-3 text-slate-300">Your Host tools are ready. Create an event foundation or return to Host Control Center.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/host/live/create">Create Live Event</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Host Control Center</LinkButton></div>
        </Card>
      </AppShell>
    );
  }

  const creator = ["creator_starter", "creator"].includes(tier.id);
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageTitle icon={<Radio className="text-[var(--gold)]" />} title={creator ? "Become a Host" : "Create challenges before hosting events"} subtitle={creator ? "Run tournaments, live events, participant reviews, voting controls, and reports." : "Start with Creator Plan, then move into Host tools when you are ready to run full competitions."} />
        <Card className="mt-8 border-yellow-500/30 p-8 text-center">
          <LockKeyhole className="mx-auto text-[var(--gold)]" size={42} />
          <h2 className="mt-5 text-2xl font-black">Host tools require Host Plan</h2>
          <p className="mt-3 text-slate-300">Subscription activation is completed only through verified Stripe webhook processing.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/subscriptions">{creator ? "Upgrade to Host" : "Become a Creator"}</LinkButton><LinkButton href="/live-events" variant="secondary">Back to Live Events</LinkButton></div>
        </Card>
      </div>
    </AppShell>
  );
}

