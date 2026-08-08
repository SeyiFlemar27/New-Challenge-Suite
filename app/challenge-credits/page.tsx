"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, CreditCard, History, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, PageTitle, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Package = { id: string; priceCents: number; credits: number };
type Summary = { balances: { challengeCredits: { balance: number } }; histories: { challengeCredits: Array<Record<string, unknown>> }; policy: { challengeCredits: string } };

export default function ChallengeCreditsPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const [packageResult, walletResult] = await Promise.all([apiRequest<{ packages: Package[] }>("/api/challenge-credits/packages"), apiRequest<Summary>("/api/economy/summary")]);
    if (packageResult.data) setPackages(packageResult.data.packages);
    if (walletResult.data) setSummary(walletResult.data);
    if (!packageResult.ok || !walletResult.ok) setNotice(packageResult.message || walletResult.message);
  }
  useEffect(() => { void load(); }, []);
  async function checkout(packageId: string) {
    setBusy(true);
    const result = await apiRequest<{ url?: string }>("/api/challenge-credits/checkout", { method: "POST", body: JSON.stringify({ packageId }) });
    setBusy(false);
    if (result.data?.url) window.location.assign(result.data.url);
    else setNotice(result.message);
  }
  async function transfer() {
    setBusy(true);
    const result = await apiRequest("/api/challenge-credits/transfer", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ receiverId, amount: Number(amount), reason: "User confirmed Challenge Credit transfer" }) });
    setBusy(false); setNotice(result.message); if (result.ok) { setAmount(""); await load(); }
  }
  return <AppShell><PageTitle title="Challenge Credits" subtitle="Premium credits for additional votes and eligible Challenge Suite features." icon={<CreditCard />} />
    <div className="mt-7 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card className="p-6"><p className="text-sm font-bold text-slate-500">Available balance</p><p className="mt-2 text-4xl font-black">{Number(summary?.balances.challengeCredits.balance ?? 0).toLocaleString()}</p><p className="mt-4 text-sm leading-6 text-slate-600">{summary?.policy.challengeCredits ?? "Challenge Credits are not cash and cannot be withdrawn."}</p></Card><Card className="p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-[var(--gold)]"/><div><h2 className="text-xl font-black">Provider-confirmed purchases</h2><p className="text-sm text-slate-600">Checkout success never credits this balance. Stripe webhook confirmation is required.</p></div></div></Card></div>
    <section className="mt-8"><h2 className="text-2xl font-black">Buy Challenge Credits</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{packages.map((pack) => <Card key={pack.id} className="p-5"><p className="text-2xl font-black">{pack.credits.toLocaleString()}</p><p className="mt-1 text-sm text-slate-500">Credits</p><p className="mt-4 font-black">${(pack.priceCents / 100).toFixed(2)}</p><Button className="mt-4 w-full" disabled={busy} onClick={() => void checkout(pack.id)}>Buy</Button></Card>)}</div></section>
    <section className="mt-8 grid gap-5 lg:grid-cols-2"><Card className="p-6"><h2 className="flex items-center gap-2 text-xl font-black"><ArrowRightLeft/> Transfer Credits</h2><p className="mt-2 text-sm text-slate-600">Transfers are ledger-backed, limited, and cannot be sent to your own account.</p><div className="mt-5 grid gap-4"><Field label="Recipient user ID"><input className={inputClass} value={receiverId} onChange={(e) => setReceiverId(e.target.value)} /></Field><Field label="Credits"><input className={inputClass} type="number" min="100" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Button disabled={busy || !receiverId || !amount} onClick={() => void transfer()}>Confirm Transfer</Button></div></Card><Card className="p-6"><h2 className="flex items-center gap-2 text-xl font-black"><History/> Credit History</h2><div className="mt-4 space-y-3">{summary?.histories.challengeCredits.length ? summary.histories.challengeCredits.slice(0, 10).map((item) => <div key={String(item.id)} className="flex justify-between border-b border-black/10 py-3 text-sm"><span>{String(item.reason ?? item.sourceType ?? "Challenge Credit activity")}</span><strong>{Number(item.signedAmount ?? item.amount ?? 0).toLocaleString()}</strong></div>) : <EmptyState icon={<History/>} title="No Challenge Credit activity" body="Confirmed purchases, spends, transfers, and approved refunds will appear here." />}</div></Card></section>{notice ? <p className="mt-5 rounded-[8px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{notice}</p> : null}</AppShell>;
}
