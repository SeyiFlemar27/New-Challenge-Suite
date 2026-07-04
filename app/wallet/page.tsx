"use client";

import { useEffect, useState } from "react";
import { Coins, LockKeyhole, ShieldCheck, TrendingUp, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { money } from "@/lib/utils";
import { fetchDoroCoinPackages, fetchWallet, purchaseCustomDoroCoins, purchaseDoroCoins } from "@/lib/api/services";

interface DoroPackage {
  id: string;
  name: string;
  coins: number;
  price: number;
  bestFor: string;
}

interface DoroTransaction {
  id: string;
  type: string;
  description: string;
  amount: number;
  createdAt?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatType(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<DoroPackage[]>([]);
  const [transactions, setTransactions] = useState<DoroTransaction[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutPackageId, setCheckoutPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [customCoins, setCustomCoins] = useState("250");
  const [account, setAccount] = useState<{ planId?: string | null; accountType?: string; role?: string | null; isAdmin?: boolean }>({});
  const [financialSummary, setFinancialSummary] = useState<any>(null);
  const freeCompetitor = String(account.planId ?? "free") === "free" && !["creator", "host"].includes(String(account.role ?? "user"));
  const hostMode = String(account.planId) === "host";

  async function loadWallet() {
    setLoading(true);
    setError(null);
    setUnauthenticated(false);
    const [walletResult, packageResult] = await Promise.all([fetchWallet(), fetchDoroCoinPackages()]);

    if (!walletResult.ok || !walletResult.data) {
      const code = (walletResult as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(walletResult.message || "Wallet could not be loaded.");
      setLoading(false);
      return;
    }

    setBalance(Number(walletResult.data.wallet.balance ?? 0));
    setAccount(walletResult.data.user ?? {});
    setFinancialSummary(walletResult.data.financialSummary ?? null);
    setTransactions(walletResult.data.transactions.map((txn) => {
      const record = txn as Partial<DoroTransaction>;
      return {
        id: String(record.id ?? ""),
        type: String(record.type ?? "adjustment"),
        description: String(record.description ?? "DoroCoin transaction"),
        amount: Number(record.amount ?? 0),
        createdAt: record.createdAt ?? null
      };
    }));

    if (!packageResult.ok || !packageResult.data) {
      setPackages([]);
      setError(packageResult.message || "DoroCoin packages could not be loaded.");
      setLoading(false);
      return;
    }

    setPackages(packageResult.data.packages.map((pack) => {
      const record = pack as Partial<DoroPackage>;
      return {
        id: String(record.id ?? ""),
        name: String(record.name ?? "DoroCoin Package"),
        coins: Number(record.coins ?? 0),
        price: Number(record.price ?? 0),
        bestFor: String(record.bestFor ?? "")
      };
    }).filter((pack) => pack.id && pack.coins > 0));
    setLoading(false);
  }

  useEffect(() => {
    loadWallet();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "mock-success") {
      setStatus("Development checkout completed. No payment was processed and no DoroCoins were credited.");
    }
  }, []);

  async function buyPackage(packageId: string) {
    setCheckoutPackageId(packageId);
    setStatus("");
    const result = await purchaseDoroCoins(packageId);
    setCheckoutPackageId(null);

    if (!result.ok || !result.data?.url) {
      setStatus(result.message || "Checkout could not be started.");
      return;
    }

    if ((result.data as any).mode === "mock" || (result.data as any).developmentOnly) {
      setStatus(result.message || "Development checkout started. No payment will be processed and no DoroCoins will be credited.");
    } else {
      setStatus("Checkout started. Your wallet updates after Stripe webhook confirmation.");
    }
    window.location.href = result.data.url;
  }

  async function buyCustomCoins() {
    const coins = Number(customCoins);
    if (!Number.isInteger(coins) || coins < 50 || coins > 10000) {
      setStatus("Enter a whole DoroCoin amount between 50 and 10,000.");
      return;
    }
    setCheckoutPackageId("custom");
    setStatus("");
    const result = await purchaseCustomDoroCoins(coins);
    setCheckoutPackageId(null);
    if (result.ok && result.data?.url) {
      if ((result.data as any).mode === "mock" || (result.data as any).developmentOnly) {
        setStatus(result.message || "Development checkout started. No payment will be processed and no DoroCoins will be credited.");
      } else {
        setStatus("Checkout started. Your wallet updates after Stripe webhook confirmation.");
      }
      window.location.href = result.data.url;
      return;
    }
    if (result.ok && result.data?.paymentPending) {
      setStatus("Payment request created. Stripe checkout still needs configuration before this can be paid.");
      return;
    }
    setStatus(result.message || "Custom DoroCoin checkout could not be started.");
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title={hostMode ? "Wallet & Revenue" : "Wallet / DoroCoin"} subtitle={hostMode ? "Review DoroCoin activity, entry activity, sponsor-interest records, and revenue foundations without moving money." : "DoroCoins are internal platform credits for votes, boosts, and future promotional features. They cannot be withdrawn or converted to cash."} icon={<Coins className="text-[var(--gold)]" />} />
        <Card className="px-7 py-5 text-right">
          <div className="text-sm font-bold text-slate-400">DoroCoin Balance</div>
          <div className="text-4xl font-black text-[var(--gold)]">{balance}</div>
        </Card>
      </div>

      {loading ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Card key={item} className="h-[150px] animate-pulse bg-[#151515]" />)}
        </div>
      ) : unauthenticated ? (
        <Card className="mt-8">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error ?? "Sign in with a verified account to view your wallet."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      ) : error ? (
        <Card className="mt-8">
          <EmptyState icon={<Coins />} title="Wallet unavailable" body={error} action={<Button onClick={loadWallet}>Retry</Button>} />
        </Card>
      ) : null}

      {!loading && !unauthenticated && !error ? <div className={`mt-8 grid gap-6 ${freeCompetitor ? "md:grid-cols-2" : "xl:grid-cols-4"}`}>
        {(freeCompetitor ? [
          { icon: <Vote />, title: "Free & DoroCoin Votes", body: "Use the challenge's free daily vote, then buy DoroCoins for additional eligible votes." },
          { icon: <Coins />, title: "Internal Platform Credits", body: "DoroCoins are used for platform voting features and cannot be withdrawn or converted to cash." }
        ] : [
          { icon: <Vote />, title: "Voting", body: "Buy additional votes for eligible submissions." },
          { icon: <TrendingUp />, title: "Boosting", body: "Increase challenge visibility when your plan allows it." },
          { icon: <LockKeyhole />, title: "Premium Entries", body: "Join locked creator challenges when allowed." },
          { icon: <Coins />, title: "Platform Credits", body: "Use DoroCoins for eligible votes, boosts, and promotional features." }
        ]).map((item) => <Card key={item.title} className="p-5"><div className="text-[var(--gold)]">{item.icon}</div><h2 className="mt-3 text-xl font-black">{item.title}</h2><p className="mt-2 text-sm text-slate-300">{item.body}</p></Card>)}
      </div> : null}

      {!loading && !unauthenticated && !error && (account.accountType === "sponsor" || account.isAdmin || ["creator", "pro", "host", "enterprise"].includes(String(account.planId))) ? <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">{account.isAdmin ? "Financial Review Foundation" : account.accountType === "sponsor" ? "Sponsor Budget Overview" : hostMode ? "Host Revenue Review" : "Earnings & Prize Review"}</h2><p className="mt-2 text-sm text-slate-400">{hostMode ? "Entry activity, vote purchases, sponsor payment review, and payout status remain read-only. Withdrawals, automatic payouts, refunds, sponsor releases, and paid-entry prize-pool releases are not active yet." : "Read-only records. Withdrawals, payout execution, refunds, and sponsor release are not active."}</p></div><span className="rounded-full border border-[var(--gold)]/30 px-3 py-2 text-xs font-black capitalize text-[var(--gold)]">{financialSummary?.payoutStatus?.replaceAll("_", " ") || "review only"}</span></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {account.accountType === "sponsor" ? <>
            <FinancialCard label="Campaign Budget" cents={financialSummary?.campaignBudgetCents} note="Separate from subscription billing" />
            <FinancialCard label="Sponsorship Spend" cents={financialSummary?.sponsorshipSpendCents} note="Proposal records only" />
            <FinancialCard label="Prize Contributions" cents={financialSummary?.prizePoolContributionsCents} note="Funding/release inactive" />
            <FinancialCard label="Invoices & Reports" cents={0} note="Placeholder" />
          </> : account.isAdmin ? <>
            <FinancialCard label="Prize Pool Review" cents={0} note="Use admin review queue" />
            <FinancialCard label="Payout Review" cents={0} note="No release controls" />
            <FinancialCard label="Disputes" cents={0} note="Review foundation" />
            <FinancialCard label="Platform Allocation" cents={0} note="Admin-only ledger" />
          </> : <>
            <FinancialCard label="Pending Earnings" cents={financialSummary?.pendingEarningsCents} note="Review-only" />
            <FinancialCard label="Sponsor Earnings" cents={financialSummary?.sponsorEarningsCents} note="No release active" />
            <FinancialCard label="Prize Winnings" cents={financialSummary?.prizeWinningsCents} note="Subject to winner review" />
            <FinancialCard label="Payout Status" cents={0} note="Withdrawals unavailable" />
          </>}
        </div>
      </section> : null}

      {!loading && !unauthenticated && !error ? <section className="mt-10">
        <h2 className="text-2xl font-black">Buy DoroCoins</h2>
        <Card className="mt-5 p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_220px_220px] lg:items-end">
            <div>
              <h3 className="text-xl font-black">Custom Purchase</h3>
              <p className="mt-2 text-sm text-slate-300">Enter the exact amount you want. MVP rate: 1 DoroCoin = $0.02.</p>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">DoroCoins</span>
              <input className="h-12 w-full rounded-[8px] border border-white/10 bg-[#11151d] px-4 font-bold outline-none focus:border-[var(--gold)]" value={customCoins} onChange={(event) => setCustomCoins(event.target.value.replace(/[^\d]/g, ""))} />
            </label>
            <div className="rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4">
              <div className="text-sm font-bold text-slate-300">Estimated total</div>
              <div className="text-2xl font-black text-[var(--gold)]">{money((Number(customCoins || 0) * 0.02) || 0)}</div>
            </div>
          </div>
          <Button className="mt-5 w-full md:w-auto" onClick={buyCustomCoins} disabled={checkoutPackageId === "custom"}>{checkoutPackageId === "custom" ? "Preparing Payment..." : "Continue to Payment"}</Button>
        </Card>
        <p className="mt-5 max-w-3xl text-sm text-slate-400">Purchases add internal DoroCoin credits only. DoroCoins have no cash value, cannot be withdrawn, and cannot be converted into payout balance.</p>
        {packages.length ? <div className="mt-5 grid gap-6 md:grid-cols-3">
          {packages.map((pack) => (
            <Card key={pack.id} className="p-6">
              <h3 className="text-xl font-black">{pack.name}</h3>
              <div className="mt-4 text-4xl font-black text-[var(--gold)]">{pack.coins}</div>
              <p className="mt-2 text-slate-300">{pack.bestFor}</p>
              <p className="mt-5 text-2xl font-black">{money(pack.price)}</p>
              <Button className="mt-5 w-full" onClick={() => buyPackage(pack.id)} disabled={checkoutPackageId === pack.id}>{checkoutPackageId === pack.id ? "Starting Checkout..." : "Buy Package"}</Button>
            </Card>
          ))}
        </div> : <Card className="mt-5"><EmptyState icon={<Coins />} title="No packages available" body="DoroCoin packages have not been configured yet." action={<Button onClick={loadWallet}>Retry</Button>} /></Card>}
        {status ? <p className={`mt-5 rounded-[8px] p-4 font-bold ${status.startsWith("Checkout started") || status.startsWith("Development checkout") ? "bg-emerald-950/40 text-emerald-200" : "bg-red-950/40 text-red-200"}`}>{status}</p> : null}
        <Card className="mt-6 border-dashed border-[var(--gold)]/30 p-6">
          <h3 className="text-xl font-black">Watch ads to earn free coins</h3>
          <p className="mt-2 text-slate-300">Coming soon. No ads are served and no DoroCoins are granted yet. A future ad network integration will require verified completion, rate limits, and fraud protection.</p>
          <Button className="mt-4" variant="secondary" disabled>Coming Soon</Button>
        </Card>
      </section> : null}

      {!loading && !unauthenticated && !error ? <section className="mt-10">
        <h2 className="text-2xl font-black">Transaction History</h2>
        <Card className="mt-5 overflow-hidden">
          {transactions.length ? transactions.map((txn) => (
            <div key={txn.id} className="grid gap-3 border-b border-white/10 p-5 md:grid-cols-[140px_1fr_120px_120px]">
              <span className="font-bold text-slate-300">{formatDate(txn.createdAt)}</span>
              <span>{txn.description}</span>
              <span className="font-bold">{formatType(txn.type)}</span>
              <span className={`text-right font-black ${txn.amount > 0 ? "text-emerald-300" : "text-red-300"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount}</span>
            </div>
          )) : <EmptyState icon={<Coins />} title="No transactions yet" body="DoroCoin purchases, votes, boosts, and admin grants will appear here." />}
        </Card>
      </section> : null}
    </AppShell>
  );
}

function FinancialCard({ label, cents = 0, note }: { label: string; cents?: number; note: string }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold)]">{money(Number(cents || 0) / 100)}</p><p className="mt-2 text-xs text-slate-400">{note}</p></Card>;
}
