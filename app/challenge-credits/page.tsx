"use client";

import { useEffect, useState } from "react";
import { CreditCard, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Summary = { balances: { challengeCredits: { balance: number } }; histories: { challengeCredits: Array<Record<string, unknown>> }; policy: { challengeCredits: string } };

export default function ChallengeCreditsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void apiRequest<Summary>("/api/economy/summary").then((walletResult) => {
      if (!active) return;
      if (walletResult.data) setSummary(walletResult.data);
      if (!walletResult.ok) setNotice(walletResult.message);
    });
    return () => { active = false; };
  }, []);
  return <AppShell><PageTitle title="Legacy Challenge Credit History" subtitle="Challenge Credits are retired. Existing records remain available for reference." icon={<CreditCard />} />
    <Card className="mt-6 border-amber-300 bg-amber-50 p-5"><p className="font-black text-amber-950">Read-only legacy wallet</p><p className="mt-2 text-sm leading-6 text-amber-900">Purchases, transfers, voting, and balance adjustments are retired. DoroCoin is the current platform credit for supported product flows.</p><LinkButton href="/dorocoins" className="mt-4">Open DoroCoin</LinkButton></Card>
    <div className="mt-7 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card className="p-6"><p className="text-sm font-bold text-slate-500">Legacy balance (read-only)</p><p className="mt-2 text-4xl font-black">{Number(summary?.balances.challengeCredits.balance ?? 0).toLocaleString()}</p><p className="mt-4 text-sm leading-6 text-slate-600">{summary?.policy.challengeCredits ?? "Challenge Credits are retired and cannot be spent, transferred, or replenished."}</p></Card><Card className="p-6"><h2 className="text-xl font-black">Legacy account records</h2><p className="mt-2 text-sm leading-6 text-slate-600">Existing provider-confirmed transactions remain available below for reference. No new Challenge Credit purchases or adjustments are accepted.</p></Card></div>
    <section className="mt-8"><Card className="p-6"><h2 className="flex items-center gap-2 text-xl font-black"><History/> Historical credit activity</h2><div className="mt-4 space-y-3">{summary?.histories.challengeCredits.length ? summary.histories.challengeCredits.slice(0, 10).map((item) => <div key={String(item.id)} className="flex justify-between border-b border-black/10 py-3 text-sm"><span>{String(item.reason ?? item.sourceType ?? "Challenge Credit activity")}</span><strong>{Number(item.signedAmount ?? item.amount ?? 0).toLocaleString()}</strong></div>) : <EmptyState icon={<History/>} title="No Challenge Credit activity" body="Historical records will appear here when available." />}</div></Card></section>{notice ? <p className="mt-5 rounded-[8px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{notice}</p> : null}</AppShell>;
}
