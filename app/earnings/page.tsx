"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, FileText, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchWallet } from "@/lib/api/services";
import { moneyFromCents } from "@/lib/utils";

type CashWallet = {
  availableBalanceCents: number;
  pendingBalanceCents: number;
  underReviewBalanceCents?: number;
  withdrawnBalanceCents?: number;
  lifetimeEarningsCents?: number;
  currency?: string;
};

type Earning = {
  id: string;
  sourceType: string;
  grossAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
  status: string;
  createdAt?: string | null;
  holdUntil?: string | null;
};

type Withdrawal = { id: string; amountCents: number; status: string; createdAt?: string | null; payoutMethodLabel?: string };
type Tab = "overview" | "transactions" | "payouts" | "documents";

export default function EarningsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [wallet, setWallet] = useState<CashWallet | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [accountType, setAccountType] = useState("user");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [walletResult, withdrawalResult] = await Promise.all([
      fetchWallet(),
      apiRequest<{ requests: Withdrawal[] }>("/api/withdrawals")
    ]);
    if (walletResult.ok && walletResult.data) {
      setWallet((walletResult.data.cashWallet ?? null) as CashWallet | null);
      setEarnings((walletResult.data.cashEarnings ?? []) as Earning[]);
      setAccountType(String(walletResult.data.user?.accountType ?? "user"));
    } else setError(walletResult.message || "Earnings could not be loaded.");
    if (withdrawalResult.ok && withdrawalResult.data) setWithdrawals(withdrawalResult.data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => earnings.filter((item) =>
    (statusFilter === "all" || item.status === statusFilter)
    && (sourceFilter === "all" || item.sourceType === sourceFilter)
  ), [earnings, sourceFilter, statusFilter]);
  const futurePayments = Number(wallet?.pendingBalanceCents ?? 0) + Number(wallet?.underReviewBalanceCents ?? 0);
  const activityLabel = accountType === "sponsor" ? "Sponsored challenge spending" : accountType === "host" || accountType === "creator" ? "Creator and challenge earnings" : "Challenge prizes and rewards";

  return <AppShell>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <PageTitle title="Earnings" subtitle="Real-money activity from verified platform records." icon={<WalletCards />} />
      <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setPayoutOpen(true)}>Add Payout Method</Button><LinkButton href="/earnings/withdraw"><ArrowDownToLine size={17} /> Withdraw Funds</LinkButton></div>
    </div>

    <div className="mt-8 flex gap-2 overflow-x-auto border-b border-white/10 pb-3" role="tablist">
      {([["overview", "Overview"], ["transactions", "Transactions"], ["payouts", "Payouts"], ["documents", "Financial Documents"]] as const).map(([value, label]) =>
        <button key={value} type="button" role="tab" aria-selected={tab === value} className={`min-h-11 shrink-0 rounded-[8px] px-4 text-sm font-black ${tab === value ? "bg-[var(--gold)] text-black" : "bg-white/5 text-slate-300"}`} onClick={() => setTab(value)}>{label}</button>
      )}
    </div>

    {loading ? <div className="mt-8 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse" />)}</div> : error ? <Card className="mt-8"><EmptyState icon={<WalletCards />} title="Earnings unavailable" body={error} action={<Button onClick={load}>Retry</Button>} /></Card> : <>
      {tab === "overview" ? <>
        <div data-mobile-wallet-summary className="mt-8 grid gap-4 md:grid-cols-3">
          <Metric label="Available Funds" value={wallet?.availableBalanceCents} hint="Eligible for a reviewed withdrawal request." />
          <Metric label="Future Payments" value={futurePayments} hint="Pending clearance or platform review." />
          <Metric label="Earnings & Expenses" value={wallet?.lifetimeEarningsCents} hint={activityLabel} />
        </div>
        <Card className="mt-8 p-6 sm:p-8">
          <div className="flex items-center gap-3"><ReceiptText className="text-[var(--gold)]" /><div><h2 className="text-2xl font-black">Recent financial activity</h2><p className="mt-1 text-sm text-slate-400">Ledger-backed credits only.</p></div></div>
          <EarningsRows entries={earnings.slice(0, 8)} />
        </Card>
      </> : null}

      {tab === "transactions" ? <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-bold">Status</span><select className="min-h-12 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="available">Available</option><option value="pending_review">Pending review</option><option value="pending_hold">Pending clearance</option><option value="withdrawal_requested">Withdrawal requested</option></select></label>
          <label><span className="mb-2 block text-sm font-bold">Activity type</span><select className="min-h-12 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All activity</option><option value="challenge_winner_prize">Challenge winner prize</option><option value="sponsor_prize">Sponsor-funded prize</option><option value="creator_challenge_earning">Creator challenge earning</option><option value="prediction_reward">Prediction reward</option></select></label>
        </div>
        <Card className="mt-5 overflow-hidden"><EarningsRows entries={filtered} /></Card>
      </section> : null}

      {tab === "payouts" ? <Card className="mt-8 overflow-hidden">
        {withdrawals.length ? withdrawals.map((item) => <div key={item.id} className="grid gap-2 border-b border-white/10 p-5 sm:grid-cols-[140px_1fr_140px]"><span className="text-sm text-slate-400">{formatDate(item.createdAt)}</span><span><b>{item.payoutMethodLabel || "Payout method under review"}</b><span className="block text-xs capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span></span><span className="font-black text-[var(--gold)] sm:text-right">{formatMoney(item.amountCents)}</span></div>) : <EmptyState icon={<Landmark />} title="No payouts yet" body="Withdrawal requests and reviewed payouts will appear here when you have real earnings activity." />}
      </Card> : null}

      {tab === "documents" ? <Card className="mt-8"><EmptyState icon={<FileText />} title="No financial documents yet" body="Statements and supported financial documents will appear when generated from real account activity." /></Card> : null}
    </>}
    {payoutOpen ? <PayoutMethodDialog onClose={() => setPayoutOpen(false)} onSaved={async () => { setPayoutOpen(false); await load(); }} /> : null}
  </AppShell>;
}

function Metric({ label, value, hint }: { label: string; value?: number; hint: string }) {
  return <Card className="p-6"><p className="text-sm font-black text-slate-400">{label}</p><p className="mt-3 text-3xl font-black text-[var(--gold)]">{formatMoney(value)}</p><p className="mt-3 text-sm leading-6 text-slate-500">{hint}</p></Card>;
}

function EarningsRows({ entries }: { entries: Earning[] }) {
  return entries.length ? <div data-mobile-wallet-source-lines className="mt-5 overflow-hidden rounded-[8px] border border-white/10">{entries.map((item) => <div key={item.id} className="grid gap-2 border-b border-white/10 p-4 sm:grid-cols-[120px_1fr_110px_110px_120px] sm:items-center"><span className="text-sm text-slate-400">{formatDate(item.createdAt)}</span><span><b>{sourceLabel(item.sourceType)}</b><span className="block text-xs capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span></span><span className="text-sm text-slate-400">Gross {formatMoney(item.grossAmountCents)}</span><span className="text-sm text-slate-400">Platform fee {formatMoney(item.feeAmountCents)}</span><span className="font-black text-[var(--gold)] sm:text-right">Net credited {formatMoney(item.netAmountCents)}</span></div>)}</div> : <EmptyState icon={<ReceiptText />} title="No earnings activity yet" body="Challenge prizes, creator earnings, sponsor-funded prizes, and prediction rewards will appear only after verified ledger events." />;
}

function sourceLabel(value: string) {
  if (value === "challenge_winner_prize") return "Challenge winner prize";
  if (value === "sponsor_prize") return "Sponsor-funded prize";
  if (value === "creator_challenge_earning") return "Creator challenge earning";
  if (value === "prediction_reward") return "Prediction reward";
  return "Financial activity";
}

function formatMoney(value?: number) { return moneyFromCents(Number(value ?? 0)); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : "Pending"; }

function PayoutMethodDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<"bank_transfer" | "paypal" | "payoneer">("bank_transfer");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await apiRequest("/api/payout-methods", {
      method: "POST",
      body: JSON.stringify({ type, accountHolderName: name, bankName, accountNumber, email, country: "US" })
    });
    setSaving(false);
    setNotice(result.message);
    if (result.ok) await onSaved();
  }

  const emailLabel = (type === "paypal" ? "PayPal" : "Payoneer") + " email";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="payout-method-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><h2 id="payout-method-title" className="text-2xl font-black">Add payout method</h2><p className="mt-2 text-sm leading-6 text-slate-400">Save masked payout details for reviewed withdrawal requests. External transfers are not automatic.</p></div><button type="button" className="min-h-11 px-3 font-black text-slate-300" onClick={onClose} aria-label="Close payout method dialog">Close</button></div>
      <form className="mt-6 space-y-5" onSubmit={save}>
        <Field label="Method"><select autoFocus className={inputClass} value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="bank_transfer">Bank Transfer</option><option value="payoneer">Payoneer</option><option value="paypal">PayPal</option></select></Field>
        <Field label="Account holder name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        {type === "bank_transfer" ? <div className="grid gap-5 sm:grid-cols-2"><Field label="Bank name"><input className={inputClass} value={bankName} onChange={(event) => setBankName(event.target.value)} required /></Field><Field label="Account number"><input className={inputClass} inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} required /></Field></div> : <Field label={emailLabel}><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>}
        {notice ? <p className="rounded-[8px] bg-white/5 p-3 text-sm text-slate-300" aria-live="polite">{notice}</p> : null}
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Payout Method"}</Button></div>
      </form>
    </Card>
  </div>;
}
