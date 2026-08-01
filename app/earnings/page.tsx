"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchWallet } from "@/lib/api/services";
import { moneyFromCents } from "@/lib/utils";

type CashWallet = { availableBalanceCents: number; pendingBalanceCents: number; underReviewBalanceCents?: number; lifetimeEarningsCents?: number; currency?: string };
type Earning = { id: string; challengeId?: string | null; settlementId?: string | null; sourceType: string; grossAmountCents: number; feeAmountCents: number; netAmountCents: number; status: string; createdAt?: string | null };
type Withdrawal = { id: string; amountCents: number; status: string; createdAt?: string | null; payoutMethodLabel?: string };
type PayoutMethod = { id: string; type: Method; label: string; currency: string; verificationStatus: string; providerConnected: boolean; primary: boolean; estimatedProcessingTime: string };
type WithdrawalData = { requests: Withdrawal[]; kycStatus: string; payoutMethods: PayoutMethod[] };
type Method = "payoneer" | "bank_transfer" | "paypal";
type Tab = "overview" | "transactions" | "payouts" | "documents";

export default function EarningsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [wallet, setWallet] = useState<CashWallet | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [kycStatus, setKycStatus] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [activity, setActivity] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [walletResult, withdrawalResult, methodResult] = await Promise.all([
      fetchWallet(),
      apiRequest<WithdrawalData>("/api/withdrawals"),
      apiRequest<{ methods: PayoutMethod[] }>("/api/payout-methods")
    ]);
    if (walletResult.ok && walletResult.data) {
      setWallet((walletResult.data.cashWallet ?? null) as CashWallet | null);
      setEarnings((walletResult.data.cashEarnings ?? []) as Earning[]);
      setError("");
    } else setError(walletResult.message || "Earnings could not be loaded.");
    if (withdrawalResult.ok && withdrawalResult.data) {
      setWithdrawals(withdrawalResult.data.requests ?? []);
      setKycStatus(withdrawalResult.data.kycStatus ?? "");
    }
    if (methodResult.ok && methodResult.data) setMethods(methodResult.data.methods ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const cutoff = dateRange === "30" ? Date.now() - 30 * 86400000 : dateRange === "90" ? Date.now() - 90 * 86400000 : 0;
    return earnings.filter((item) => (activity === "all" || item.sourceType === activity) && (!cutoff || Date.parse(String(item.createdAt ?? "")) >= cutoff));
  }, [activity, dateRange, earnings]);
  const expenses = earnings.reduce((sum, item) => sum + Number(item.feeAmountCents ?? 0), 0);
  const available = Number(wallet?.availableBalanceCents ?? 0);

  return <AppShell><main className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black sm:text-4xl">Earnings</h1><p className="mt-3 text-slate-400">Review real cash earnings, expenses, payouts, and financial documents.</p></div><LinkButton href="/help/earnings" variant="ghost">Learn more about this page</LinkButton></div>
    <div className="mt-7 flex gap-2 overflow-x-auto border-b border-white/10 pb-3" role="tablist">{([["overview", "Overview"], ["transactions", "Transactions"], ["payouts", "Payouts"], ["documents", "Financial Documents"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={"min-h-11 shrink-0 rounded-[8px] px-4 text-sm font-black " + (tab === value ? "bg-[var(--gold)] text-black" : "bg-white/5 text-slate-300")} onClick={() => setTab(value)}>{label}</button>)}</div>
    {loading ? <Card className="mt-8 h-72 animate-pulse" /> : error ? <Card className="mt-8 p-7"><h2 className="text-2xl font-black">Earnings unavailable</h2><p className="mt-3 text-red-200">{error}</p><Button className="mt-5" onClick={() => void load()}>Retry</Button></Card> : <>
      {tab === "overview" ? <><div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="p-6 sm:p-8"><p className="text-sm font-black text-slate-400">Available funds</p><p className="mt-3 text-4xl font-black text-[var(--gold)]">{formatMoney(available)}</p><p className="mt-3 text-sm leading-6 text-slate-400">Balance available for withdrawal or use after platform review.</p><div className="mt-6 flex flex-wrap gap-3">{!methods.length ? <Button onClick={() => setPayoutOpen(true)}>Add Payout Method</Button> : kycStatus !== "verified" ? <LinkButton href="/kyc/status">Complete Verification</LinkButton> : available > 0 ? <LinkButton href="/earnings/withdraw">Withdraw Funds</LinkButton> : <Button disabled variant="secondary">No funds available</Button>}</div></Card>
        <Card className="p-6 sm:p-8"><p className="text-sm font-black text-slate-400">Earnings & expenses</p><div className="mt-5 grid grid-cols-2 gap-5"><div><p className="text-xs uppercase text-slate-500">Earnings to date</p><p className="mt-2 text-2xl font-black">{formatMoney(wallet?.lifetimeEarningsCents)}</p></div><div><p className="text-xs uppercase text-slate-500">Expenses to date</p><p className="mt-2 text-2xl font-black">{formatMoney(expenses)}</p></div></div><label className="mt-6 block text-sm font-bold">Period<select className={inputClass + " mt-2"} disabled><option>Since joining</option></select></label></Card>
      </div><ActivitySection entries={filtered} dateRange={dateRange} setDateRange={setDateRange} activity={activity} setActivity={setActivity} /></> : null}
      {tab === "transactions" ? <ActivitySection entries={filtered} dateRange={dateRange} setDateRange={setDateRange} activity={activity} setActivity={setActivity} /> : null}
      {tab === "payouts" ? <Card className="mt-8 overflow-hidden">{withdrawals.length ? withdrawals.map((item) => <div key={item.id} className="grid gap-2 border-b border-white/10 p-5 sm:grid-cols-[140px_1fr_140px]"><span className="text-sm text-slate-400">{formatDate(item.createdAt)}</span><span><b>{item.payoutMethodLabel || "Payout method under review"}</b><span className="block text-xs capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span></span><span className="font-black text-[var(--gold)] sm:text-right">{formatMoney(item.amountCents)}</span></div>) : <PlainEmpty title="No payouts yet" body="Reviewed withdrawal requests will appear here when you have eligible real earnings." />}</Card> : null}
      {tab === "documents" ? <Card className="mt-8"><PlainEmpty title="No financial documents yet" body="Supported statements will appear after they are generated from real account activity." /></Card> : null}
    </>}
    {payoutOpen ? <PayoutMethodDialog onClose={() => setPayoutOpen(false)} onChanged={load} /> : null}
  </main></AppShell>;
}

function ActivitySection({ entries, dateRange, setDateRange, activity, setActivity }: { entries: Earning[]; dateRange: string; setDateRange: (value: string) => void; activity: string; setActivity: (value: string) => void }) {
  return <section className="mt-8"><div className="grid gap-4 sm:grid-cols-2"><Field label="Date range"><select className={inputClass} value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></Field><Field label="Activity"><select className={inputClass} value={activity} onChange={(event) => setActivity(event.target.value)}><option value="all">All activity</option><option value="challenge_winner_prize">Challenge winner prize</option><option value="sponsor_prize">Sponsor-funded prize</option><option value="creator_challenge_earning">Creator or host earning</option><option value="prediction_reward">Prediction Arena payout</option></select></Field></div><Card className="mt-5 overflow-x-auto">{entries.length ? <table className="w-full min-w-[680px] text-left"><thead className="border-b border-white/10 text-xs uppercase text-slate-500"><tr><th className="p-4">Date</th><th className="p-4">Activity</th><th className="p-4">Order / Reference</th><th className="p-4 text-right">Amount</th></tr></thead><tbody>{entries.map((item) => <tr key={item.id} className="border-b border-white/10"><td className="p-4 text-sm text-slate-400">{formatDate(item.createdAt)}</td><td className="p-4"><b>{sourceLabel(item.sourceType)}</b><span className="block text-xs capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span></td><td className="p-4 text-sm text-slate-400">{item.settlementId || item.challengeId || item.id}</td><td className="p-4 text-right font-black text-[var(--gold)]">{formatMoney(item.netAmountCents)}</td></tr>)}</tbody></table> : <PlainEmpty title="Your earnings will appear here." body="Once you receive prize winnings, creator earnings, host earnings, or Prediction Arena payouts, your financial activity will show here." />}</Card></section>;
}

const payoutOptions: Array<{ type: Method; name: string; time: string }> = [
  { type: "payoneer", name: "Payoneer account", time: "Up to 1 business day" },
  { type: "bank_transfer", name: "Bank transfer", time: "Up to 3 business days" },
  { type: "paypal", name: "PayPal account", time: "Up to 1 business day" }
];

function PayoutMethodDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"choose" | "setup" | "complete">("choose");
  const [selected, setSelected] = useState<Method | null>(null);
  const [currency, setCurrency] = useState<Record<Method, string>>({ payoneer: "USD", bank_transfer: "USD", paypal: "USD" });
  const [form, setForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", bankCode: "", routingInformation: "", country: "US", accountType: "checking" });
  const [saved, setSaved] = useState<PayoutMethod | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const node = root.current;
    node?.querySelector<HTMLElement>("button, input, select")?.focus();
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [onClose, step]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    const result = await apiRequest<{ method: PayoutMethod }>("/api/payout-methods", { method: "POST", body: JSON.stringify({ type: selected, currency: currency[selected], ...form }) });
    setSaving(false);
    setNotice(result.message);
    if (result.ok && result.data?.method) { setSaved(result.data.method); setStep("complete"); await onChanged(); }
  }
  async function makePrimary() {
    if (!saved) return;
    const result = await apiRequest<{ method: PayoutMethod }>("/api/payout-methods", { method: "PATCH", body: JSON.stringify({ id: saved.id }) });
    setNotice(result.message);
    if (result.ok && result.data?.method) { setSaved(result.data.method); await onChanged(); }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div ref={root} className="w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="payout-title"><Card className="max-h-[92vh] overflow-y-auto p-5 sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><h2 id="payout-title" className="text-2xl font-black">{step === "complete" ? "Payout Method Added" : "Add payout method"}</h2>{step !== "complete" ? <p className="mt-2 text-sm text-slate-400">{step === "choose" ? "Choose payout method and currency" : "Complete payout method setup"}</p> : null}</div><button type="button" className="min-h-11 px-3 font-bold" onClick={onClose} aria-label="Close payout method modal">Close</button></div>
    {step === "choose" ? <><div className="mt-6 space-y-3">{payoutOptions.map((option) => <div key={option.type} className={"grid gap-3 rounded-[8px] border p-4 sm:grid-cols-[1fr_130px] sm:items-center " + (selected === option.type ? "border-[var(--gold)] bg-yellow-400/5" : "border-white/10")}><label className="flex cursor-pointer gap-3"><input type="radio" name="payout-method" checked={selected === option.type} onChange={() => setSelected(option.type)} /><span><b>{option.name}</b><span className="mt-1 block text-sm text-slate-400">{option.time}</span><span className="block text-xs text-slate-500">Fees may apply</span></span></label><select aria-label={option.name + " currency"} className={inputClass} value={currency[option.type]} onChange={(event) => setCurrency((current) => ({ ...current, [option.type]: event.target.value }))}><option>USD</option></select></div>)}</div><p className="mt-5 text-sm text-slate-400">Available payout methods are based on your account location.</p><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!selected} onClick={() => setStep("setup")}>Continue</Button></div></> : null}
    {step === "setup" && selected === "bank_transfer" ? <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Account holder name"><input className={inputClass} value={form.accountHolderName} onChange={(event) => setForm({ ...form, accountHolderName: event.target.value })} /></Field><Field label="Bank name"><input className={inputClass} value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></Field><Field label="Account number"><input className={inputClass} inputMode="numeric" value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value.replace(/\D/g, "") })} /></Field><Field label="Bank code"><input className={inputClass} value={form.bankCode} onChange={(event) => setForm({ ...form, bankCode: event.target.value })} /></Field><Field label="Routing information"><input className={inputClass} value={form.routingInformation} onChange={(event) => setForm({ ...form, routingInformation: event.target.value })} /></Field><Field label="Country"><select className={inputClass} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })}><option value="US">United States</option><option value="NG">Nigeria</option></select></Field><Field label="Currency"><select className={inputClass} value={currency.bank_transfer} onChange={(event) => setCurrency({ ...currency, bank_transfer: event.target.value })}><option>USD</option></select></Field><Field label="Account type"><select className={inputClass} value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}><option value="checking">Checking</option><option value="savings">Savings</option></select></Field><div className="sm:col-span-2 flex justify-end gap-3"><Button variant="secondary" onClick={() => setStep("choose")}>Back</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save for Verification"}</Button></div></div> : null}
    {step === "setup" && selected !== "bank_transfer" ? <div className="mt-6"><Card className="p-5"><h3 className="text-lg font-black">{selected === "paypal" ? "PayPal account" : "Payoneer account"}</h3><p className="mt-3 text-sm leading-6 text-slate-300">Provider-authorized connection is required. Saving this method records a connection request only; it will not be marked connected or enabled for transfers.</p></Card><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setStep("choose")}>Back</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save Connection Request"}</Button></div></div> : null}
    {step === "complete" && saved ? <div className="mt-6"><dl className="divide-y divide-white/10 rounded-[8px] border border-white/10 px-5">{[["Provider", methodLabel(saved.type)], ["Masked account details", saved.label], ["Currency", saved.currency], ["Verification status", label(saved.verificationStatus)], ["Primary status", saved.primary ? "Primary" : "Not primary"], ["Estimated payout time", saved.estimatedProcessingTime]].map(([name, value]) => <div key={name} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm text-slate-400">{name}</dt><dd className="break-words font-bold">{value}</dd></div>)}</dl>{notice ? <p className="mt-4 text-sm text-slate-300" aria-live="polite">{notice}</p> : null}<div className="mt-6 flex flex-wrap justify-end gap-3">{!saved.primary ? <Button variant="secondary" onClick={() => void makePrimary()}>Set as Primary</Button> : null}<Button variant="secondary" onClick={() => { setSelected(null); setSaved(null); setStep("choose"); }}>Add Another Method</Button><Button onClick={onClose}>Return to Earnings</Button></div></div> : null}
    {notice && step !== "complete" ? <p className="mt-4 text-sm text-red-200" role="alert">{notice}</p> : null}
  </Card></div></div>;
}

function PlainEmpty({ title, body }: { title: string; body: string }) { return <div className="px-5 py-16 text-center"><h2 className="text-xl font-black">{title}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">{body}</p></div>; }
function sourceLabel(value: string) { if (value === "challenge_winner_prize") return "Challenge winner prize"; if (value === "sponsor_prize") return "Sponsor-funded prize"; if (value === "creator_challenge_earning") return "Creator or host earning"; if (value === "prediction_reward") return "Prediction Arena payout"; return "Financial activity"; }
function methodLabel(value: Method) { return value === "bank_transfer" ? "Bank transfer" : value === "paypal" ? "PayPal account" : "Payoneer account"; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function formatMoney(value?: number) { return moneyFromCents(Number(value ?? 0)); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : "Pending"; }