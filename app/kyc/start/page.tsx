"use client";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { SumsubVerificationPanel } from "@/components/sumsub-verification-panel";
import { CheckCircle2, IdCard, Lightbulb, ShieldCheck } from "lucide-react";

const checklist = [
  "Have your government ID ready",
  "Make sure your camera is available",
  "Use your legal name",
  "Stay in a well-lit environment",
  "Do not refresh while verification is submitting"
];

export default function KycStartPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-[8px] border border-[var(--gold)]/20 bg-[#101010] p-6 sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Secure verification</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Start identity verification</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">You'll complete this process securely through our verification provider. Challenge Suite stores only verification status and provider metadata.</p>
        </section>
        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <Card className="p-6 sm:p-8">
            <IdCard className="text-[var(--gold)]" />
            <h2 className="mt-4 text-2xl font-black">Before you begin</h2>
            <div className="mt-5 space-y-3">
              {checklist.map((item) => <p key={item} className="flex gap-3 rounded-[8px] border border-white/10 bg-black/30 p-3 text-sm font-bold text-slate-200"><CheckCircle2 className="shrink-0 text-emerald-400" size={17} />{item}</p>)}
            </div>
            <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-100"><Lightbulb className="mb-2" size={18} />If verification is temporarily unavailable, you can retry later. Free/basic features remain available while review is pending.</p>
          </Card>
          <SumsubVerificationPanel />
        </div>
        <Card className="p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mb-2 text-[var(--gold)]" />Identity verification does not automatically trigger payouts, withdrawals, refunds, sponsor releases, prize releases, or Prediction Arena settlement.</Card>
      </div>
    </AppShell>
  );
}
