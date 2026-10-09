"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, ReceiptText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type CursorPage<T> = { items: T[]; hasMore: boolean; nextCursor: string | null };
type ChallengeTransaction = {
  id: string;
  challengeId: string;
  transactionId: string | null;
  sourceType: string;
  shareType: string | null;
  amountCents: number;
  currency: string;
  direction: string;
  status: string;
  createdAt: string | null;
  confirmedAt: string | null;
  refundedAt: string | null;
  refundOf: string | null;
};
type RevenueTransaction = {
  id: string;
  challengeId: string;
  settlementId: string | null;
  sourceType: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string | null;
  externalPayoutExecuted: boolean;
};
type CashTransaction = { id: string; challengeId: string; sourceId: string | null; transactionType: string; amountCents: number; currency: string; direction: string; status: string; createdAt: string | null };
type Exposure = {
  challengeId: string;
  configuredPrizeObligationCents: number;
  exposureCents: number;
  maximumCents: number;
  confirmed: { creatorFundingCents: number; sponsorPrizeCents: number; paidEntryWinnerAllocationCents: number; promotionalPrizeCents: number };
  reserved: { creatorFundingCents: number; additiveContributionsCents: number };
};
type Settlement = {
  id: string;
  challengeId: string;
  settlementId: string;
  status: string;
  organizationRevenueCents: number;
  winnerDistributionCents: number;
  winnerCount: number;
  createdAt: string | null;
  payoutProviderCalled: boolean;
  externalPayoutExecuted: boolean;
};
type FinancePayload = {
  organizationId: string;
  currency: string;
  wallet: { recordExists: boolean; pendingBalanceCents: number | null; lifetimeChallengeRevenueCents: number | null; withdrawalsEnabled: boolean };
  accounting: { maximumPrizePoolPerChallengeCents: number; externalPayoutExecutionEnabled: boolean; sponsorPrizeContributionsAreOrganizationRevenue: boolean };
  challengeTransactions: CursorPage<ChallengeTransaction>;
  cashTransactions: CursorPage<CashTransaction>;
  organizationRevenueTransactions: CursorPage<RevenueTransaction>;
  prizeExposure: CursorPage<Exposure>;
  settlements: CursorPage<Settlement>;
};

type FinanceData = Omit<FinancePayload, "challengeTransactions" | "cashTransactions" | "organizationRevenueTransactions" | "prizeExposure" | "settlements"> & {
  challengeTransactions: CursorPage<ChallengeTransaction>;
  cashTransactions: CursorPage<CashTransaction>;
  organizationRevenueTransactions: CursorPage<RevenueTransaction>;
  prizeExposure: CursorPage<Exposure>;
  settlements: CursorPage<Settlement>;
};

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Not recorded";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

function displayLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function EnterpriseFinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState("");
  const [authorizationError, setAuthorizationError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState("");

  const load = useCallback(async (cursorName?: keyof Pick<FinancePayload, "challengeTransactions" | "cashTransactions" | "organizationRevenueTransactions" | "prizeExposure" | "settlements">, cursor?: string) => {
    const params = new URLSearchParams({ pageSize: "20" });
    const cursorParams = { challengeTransactions: "challengeCursor", cashTransactions: "cashCursor", organizationRevenueTransactions: "revenueCursor", prizeExposure: "exposureCursor", settlements: "settlementCursor" };
    if (cursorName && cursor) params.set(cursorParams[cursorName], cursor);
    const result = await apiRequest<FinancePayload>(`/api/enterprise/finance?${params.toString()}`);
    if (!result.ok || !result.data) {
      setError(result.message || "Enterprise finance records could not be loaded.");
      setAuthorizationError(result.status === 401 || result.status === 403);
      setLoading(false);
      setLoadingMore("");
      return;
    }
    setError("");
    setAuthorizationError(false);
    setData((current) => {
      if (!current || !cursorName) return result.data as FinanceData;
      const next = result.data as FinancePayload;
      const merged = { ...current };
      if (cursorName === "challengeTransactions") merged.challengeTransactions = { ...next.challengeTransactions, items: [...current.challengeTransactions.items, ...next.challengeTransactions.items] };
      if (cursorName === "cashTransactions") merged.cashTransactions = { ...next.cashTransactions, items: [...current.cashTransactions.items, ...next.cashTransactions.items] };
      if (cursorName === "organizationRevenueTransactions") merged.organizationRevenueTransactions = { ...next.organizationRevenueTransactions, items: [...current.organizationRevenueTransactions.items, ...next.organizationRevenueTransactions.items] };
      if (cursorName === "prizeExposure") merged.prizeExposure = { ...next.prizeExposure, items: [...current.prizeExposure.items, ...next.prizeExposure.items] };
      if (cursorName === "settlements") merged.settlements = { ...next.settlements, items: [...current.settlements.items, ...next.settlements.items] };
      return merged;
    });
    setLoading(false);
    setLoadingMore("");
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<FinancePayload>("/api/enterprise/finance?pageSize=20").then((result) => {
      if (!active) return;
      if (!result.ok || !result.data) {
        setError(result.message || "Enterprise finance records could not be loaded.");
        setAuthorizationError(result.status === 401 || result.status === 403);
      } else {
        setData(result.data);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const loadMore = (key: keyof Pick<FinancePayload, "challengeTransactions" | "cashTransactions" | "organizationRevenueTransactions" | "prizeExposure" | "settlements">, page: CursorPage<unknown>) => {
    if (!page.nextCursor) return;
    setLoadingMore(key);
    void load(key, page.nextCursor);
  };

  const currency = data?.currency ?? "USD";
  return <AppShell><div className="mx-auto max-w-7xl">
    <PageTitle title="Enterprise Finance" subtitle="Organization-attributed financial records, prize exposure, and settlement review. Operational challenge metrics are shown separately." icon={<Landmark className="text-[var(--gold)]" />} />
    {error ? <Card role="alert" className="mt-7 border-red-300 p-5 text-red-700"><h2 className="font-black">{authorizationError ? "Finance access unavailable" : "Finance records could not be loaded"}</h2><p className="mt-1">{error}</p></Card> : null}
    {loading ? <Card aria-label="Loading finance records" className="mt-7 h-48 animate-pulse" /> : null}
    {!loading && !error && data ? <>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-slate-600">Pending organization finance balance</p><p className="mt-2 text-3xl font-black">{data.wallet.recordExists ? formatMoney(data.wallet.pendingBalanceCents, currency) : "Not recorded"}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-600">Lifetime confirmed challenge revenue</p><p className="mt-2 text-3xl font-black">{data.wallet.recordExists ? formatMoney(data.wallet.lifetimeChallengeRevenueCents, currency) : "Not recorded"}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-600">Payout execution</p><p className="mt-2 text-xl font-black">Disabled</p><p className="mt-1 text-sm text-slate-600">Finance balances remain pending review; this page cannot initiate transfers.</p></Card>
      </div>
      {!data.wallet.recordExists ? <Card className="mt-4 p-5 text-sm text-slate-600">No organization finance balance record has been created. No balance is inferred from transaction pages.</Card> : null}

      <section className="mt-9" aria-labelledby="exposure-heading">
        <h2 id="exposure-heading" className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="text-[var(--gold)]" /> Prize pool exposure</h2>
        <p className="mt-2 text-sm text-slate-600">Configured obligation is shown separately from confirmed and reserved funds. Each Enterprise challenge is capped at {formatMoney(data.accounting.maximumPrizePoolPerChallengeCents, currency)}.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{data.prizeExposure.items.map((item) => <Card key={item.challengeId} className="p-5">
          <h3 className="font-black">Challenge {item.challengeId}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>Configured obligation</dt><dd className="text-right">{formatMoney(item.configuredPrizeObligationCents, currency)}</dd><dt>Current exposure</dt><dd className="text-right">{formatMoney(item.exposureCents, currency)}</dd><dt>Confirmed creator funding</dt><dd className="text-right">{formatMoney(item.confirmed.creatorFundingCents, currency)}</dd><dt>Reserved funding</dt><dd className="text-right">{formatMoney(item.reserved.creatorFundingCents + item.reserved.additiveContributionsCents, currency)}</dd><dt>Sponsor prize contribution</dt><dd className="text-right">{formatMoney(item.confirmed.sponsorPrizeCents, currency)}</dd><dt>Paid-entry winner allocation</dt><dd className="text-right">{formatMoney(item.confirmed.paidEntryWinnerAllocationCents, currency)}</dd><dt>Promotional prize funding</dt><dd className="text-right">{formatMoney(item.confirmed.promotionalPrizeCents, currency)}</dd></dl>
        </Card>)}{data.prizeExposure.items.length === 0 ? <Card className="p-5 text-sm text-slate-600">No organization-attributed prize exposure records yet.</Card> : null}</div>
        {data.prizeExposure.hasMore ? <Button className="mt-4" variant="secondary" disabled={loadingMore === "prizeExposure"} onClick={() => loadMore("prizeExposure", data.prizeExposure)}>{loadingMore === "prizeExposure" ? "Loading…" : "Load more exposure records"}</Button> : null}
      </section>

      <section className="mt-9" aria-labelledby="org-revenue-heading">
        <h2 id="org-revenue-heading" className="flex items-center gap-2 text-2xl font-black"><Landmark className="text-[var(--gold)]" /> Organization revenue and settlements</h2>
        <p className="mt-2 text-sm text-slate-600">These records are organization-attributed settlement entries. Winner distributions remain winner-owned and external payout execution is disabled.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{data.organizationRevenueTransactions.items.map((item) => <Card key={item.id} className="p-5"><p className="font-black">{formatMoney(item.amountCents, item.currency)} · {displayLabel(item.status)}</p><p className="mt-1 text-sm text-slate-600">{displayLabel(item.sourceType)} · challenge {item.challengeId}</p><p className="mt-1 text-xs text-slate-500">{item.createdAt ?? "Date unavailable"} · {item.externalPayoutExecuted ? "External payout executed" : "No external payout"}</p></Card>)}</div>
        {data.organizationRevenueTransactions.items.length === 0 ? <Card className="mt-4 p-5 text-sm text-slate-600">No organization revenue ledger entries yet.</Card> : null}
        {data.organizationRevenueTransactions.hasMore ? <Button className="mt-4" variant="secondary" disabled={loadingMore === "organizationRevenueTransactions"} onClick={() => loadMore("organizationRevenueTransactions", data.organizationRevenueTransactions)}>{loadingMore === "organizationRevenueTransactions" ? "Loading…" : "Load more revenue records"}</Button> : null}
      </section>

      <section className="mt-9" aria-labelledby="challenge-transactions-heading">
        <h2 id="challenge-transactions-heading" className="flex items-center gap-2 text-2xl font-black"><ReceiptText className="text-[var(--gold)]" /> Challenge finance transactions</h2>
        <p className="mt-2 text-sm text-slate-600">Prize-directed contributions, paid-entry allocations, confirmed and pending ledger states, and source-linked reversals. Sponsor prize contributions are not organization earnings.</p>
        <div className="mt-4 grid gap-3">{data.challengeTransactions.items.map((item) => <Card key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black">{displayLabel(item.sourceType)}{item.shareType ? ` · ${displayLabel(item.shareType)}` : ""}</p><p className="mt-1 text-sm text-slate-600">Challenge {item.challengeId} · {displayLabel(item.status)} · {item.direction}</p><p className="mt-1 text-xs text-slate-500">{item.createdAt ?? "Date unavailable"}{item.refundOf ? ` · reversal of ${item.refundOf}` : ""}</p></div><p className="text-lg font-black">{formatMoney(item.amountCents, item.currency)}</p></div></Card>)}</div>
        {data.challengeTransactions.items.length === 0 ? <Card className="mt-4 p-5 text-sm text-slate-600">No organization-attributed challenge finance transactions yet.</Card> : null}
        {data.challengeTransactions.hasMore ? <Button className="mt-4" variant="secondary" disabled={loadingMore === "challengeTransactions"} onClick={() => loadMore("challengeTransactions", data.challengeTransactions)}>{loadingMore === "challengeTransactions" ? "Loading…" : "Load more challenge transactions"}</Button> : null}
      </section>
      <section className="mt-9" aria-labelledby="cash-transactions-heading">
        <h2 id="cash-transactions-heading" className="text-2xl font-black">Organization cash ledger and reversals</h2>
        <div className="mt-4 grid gap-3">{data.cashTransactions.items.map((item) => <Card key={item.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-black">{displayLabel(item.transactionType)} · {displayLabel(item.status)}</p><p className="mt-1 text-sm text-slate-600">Challenge {item.challengeId} · {item.direction}{item.sourceId ? ` · source ${item.sourceId}` : ""}</p><p className="mt-1 text-xs text-slate-500">{item.createdAt ?? "Date unavailable"}</p></div><p className="text-lg font-black">{formatMoney(item.amountCents, item.currency)}</p></div></Card>)}</div>
        {data.cashTransactions.items.length === 0 ? <Card className="mt-4 p-5 text-sm text-slate-600">No organization cash ledger entries or reversals yet.</Card> : null}
        {data.cashTransactions.hasMore ? <Button className="mt-4" variant="secondary" disabled={loadingMore === "cashTransactions"} onClick={() => loadMore("cashTransactions", data.cashTransactions)}>{loadingMore === "cashTransactions" ? "Loading…" : "Load more cash ledger entries"}</Button> : null}
      </section>
      <div className="mt-9"><h2 className="text-2xl font-black">Settlement records</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{data.settlements.items.map((item) => <Card key={item.id} className="p-5"><p className="font-black">Challenge {item.challengeId} · {displayLabel(item.status)}</p><p className="mt-2 text-sm text-slate-600">Organization revenue: {formatMoney(item.organizationRevenueCents, currency)}</p><p className="mt-1 text-sm text-slate-600">Winner distributions: {formatMoney(item.winnerDistributionCents, currency)} across {item.winnerCount} winners</p><p className="mt-1 text-xs text-slate-500">{item.createdAt ?? "Date unavailable"} · no external payout</p></Card>)}</div>{data.settlements.items.length === 0 ? <Card className="mt-4 p-5 text-sm text-slate-600">No organization-attributed settlements yet.</Card> : null}{data.settlements.hasMore ? <Button className="mt-4" variant="secondary" disabled={loadingMore === "settlements"} onClick={() => loadMore("settlements", data.settlements)}>{loadingMore === "settlements" ? "Loading…" : "Load more settlements"}</Button> : null}</div>
    </> : null}
  </div></AppShell>;
}
