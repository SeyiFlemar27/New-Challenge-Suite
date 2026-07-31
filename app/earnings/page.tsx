"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, FileText, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
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
      <LinkButton href="/earnings/withdraw"><ArrowDownToLine size={17} /> Withdraw Funds</LinkButton>
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
