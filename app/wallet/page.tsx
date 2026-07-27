"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, History, LockKeyhole, TrendingUp, Vote } from "lucide-react";
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
  amount: number;
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
  const [cashWallet, setCashWallet] = useState<any>(null);
  const hostMode = String(account.planId) === "host";
  const customCoinAmount = Number(customCoins || 0);
  const customCoinInvalid = !Number.isInteger(customCoinAmount) || customCoinAmount < 50 || customCoinAmount > 10000;
  const earningsCents = Number(financialSummary?.pendingEarningsCents ?? 0) + Number(financialSummary?.prizeWinningsCents ?? 0) + Number(financialSummary?.sponsorEarningsCents ?? 0);
  const showEarnings = !loading && !unauthenticated && !error && account.accountType !== "sponsor" && earningsCents > 0;
  const recentActivityCount = useMemo(() => transactions.length, [transactions.length]);

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
    setCashWallet(walletResult.data.cashWallet ?? null);
    setTransactions((walletResult.data.transactions ?? []).map((txn) => {
      const record = txn as Partial<DoroTransaction>;
      return { id: String(record.id ?? ""), amount: Number(record.amount ?? 0) };
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
    if (checkoutPackageId) return;
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
    if (customCoinInvalid || checkoutPackageId) {
      setStatus("Enter a whole DoroCoin amount between 50 and 10,000.");
      return;
    }
    setCheckoutPackageId("custom");
    setStatus("");
    const result = await purchaseCustomDoroCoins(customCoinAmount);
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
        <PageTitle title={hostMode ? "Wallet" : "Wallet / DoroCoin"} subtitle="Use DoroCoin for eligible votes, boosts, and platform actions." icon={<Coins className="text-[var(--gold)]" />} />
        <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
          <Card className="px-6 py-4 text-left sm:text-right">
            <div className="text-sm font-bold text-slate-400">DoroCoin Balance</div>
            <div className="text-4xl font-black text-[var(--gold)]">{balance}</div>
          </Card>
          <LinkButton href="/wallet/transactions" variant="secondary" className="min-h-14 justify-center"><History size={17} /> Transaction History</LinkButton>
        </div>
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

      {!loading && !unauthenticated && !error ? <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Card className="p-5"><Vote className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Eligible Voting</h2><p className="mt-2 text-sm text-slate-300">Use free daily votes where available, then spend DoroCoins on eligible additional votes.</p></Card>
        <Card className="p-5"><TrendingUp className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Boosts</h2><p className="mt-2 text-sm text-slate-300">Use DoroCoins for platform actions your account and challenge rules allow.</p></Card>
        <Card className="p-5"><Coins className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Platform Credits</h2><p className="mt-2 text-sm text-slate-300">DoroCoins are internal credits. They cannot be withdrawn or converted to cash.</p></Card>
      </div> : null}

      {showEarnings ? <Card className="mt-8 flex flex-col gap-5 border-[var(--gold)]/25 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-black">Earnings</h2><p className="mt-2 text-sm text-slate-300">Approved winnings and eligible creator earnings can be submitted for withdrawal after verification.</p></div>
        <LinkButton href="/wallet/withdraw" variant="secondary" className="w-full sm:w-auto">Withdraw</LinkButton>
      </Card> : null}

      {!loading && !unauthenticated && !error ? <Card className="mt-8 p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-black">Cash Balance</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Cash earnings are separate from DoroCoins. Withdrawals require KYC and review.</p>
          </div>
          <LinkButton href="/wallet/withdraw" variant="secondary">Withdraw</LinkButton>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <CashMetric label="Available Balance" value={Number(cashWallet?.availableBalanceCents ?? 0)} />
          <CashMetric label="Pending Balance" value={Number(cashWallet?.pendingBalanceCents ?? 0)} />
          <CashMetric label="On Hold" value={Number(cashWallet?.underReviewBalanceCents ?? cashWallet?.lockedBalanceCents ?? 0)} />
          <CashMetric label="Withdrawn Total" value={Number(cashWallet?.withdrawnBalanceCents ?? 0)} />
          <CashMetric label="Lifetime Earnings" value={Number(cashWallet?.lifetimeEarningsCents ?? 0)} />
        </div>
        <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-50/90">DoroCoins cannot be withdrawn or converted to cash. Reward points are not cash.</p>
      </Card> : null}

      {!loading && !unauthenticated && !error ? <section className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">Buy DoroCoins</h2><p className="mt-2 text-sm text-slate-400">Choose a package or enter a custom amount. Checkout updates after payment confirmation.</p></div><p className="text-sm font-bold text-slate-400">{recentActivityCount ? `${recentActivityCount} wallet records` : "No transactions yet"}</p></div>
        <Card className="mt-5 p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_220px_220px] lg:items-end">
            <div>
              <h3 className="text-xl font-black">Custom DoroCoin Purchase</h3>
              <p className="mt-2 text-sm text-slate-300">Enter a whole number from 50 to 10,000 DoroCoins.</p>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">DoroCoins</span>
              <input className={`h-12 w-full rounded-[8px] border bg-[#11151d] px-4 font-bold outline-none focus:border-[var(--gold)] ${customCoinInvalid ? "border-red-400/70" : "border-white/10"}`} value={customCoins} onChange={(event) => setCustomCoins(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
            </label>
            <div className="rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4">
              <div className="text-sm font-bold text-slate-300">Estimated total</div>
              <div className="text-2xl font-black text-[var(--gold)]">{money((customCoinAmount * 0.02) || 0)}</div>
            </div>
          </div>
          {customCoinInvalid ? <p className="mt-3 text-sm font-bold text-red-200">Enter at least 50 DoroCoins and no more than 10,000.</p> : null}
          <Button className="mt-5 w-full md:w-auto" onClick={buyCustomCoins} disabled={customCoinInvalid || checkoutPackageId === "custom"}>{checkoutPackageId === "custom" ? "Preparing Payment..." : "Continue to Payment"}</Button>
        </Card>
        <p className="mt-5 max-w-3xl text-sm text-slate-400">Purchases add internal DoroCoin credits only. DoroCoins have no cash value, cannot be withdrawn, and cannot be converted into payout balance.</p>
        {packages.length ? <div className="mt-5 grid gap-6 md:grid-cols-3">
          {packages.map((pack) => (
            <Card key={pack.id} className="flex min-h-[260px] flex-col p-6">
              <h3 className="text-xl font-black">{pack.name}</h3>
              <div className="mt-4 text-4xl font-black text-[var(--gold)]">{pack.coins.toLocaleString()}</div>
              <p className="text-sm font-bold text-slate-400">DoroCoins</p>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">{pack.bestFor}</p>
              <div className="mt-5 flex items-end justify-between gap-3"><p className="text-2xl font-black">{money(pack.price)}</p><p className="text-xs text-slate-400">{money(pack.price / Math.max(1, pack.coins))} each</p></div>
              <Button className="mt-5 w-full" onClick={() => buyPackage(pack.id)} disabled={Boolean(checkoutPackageId)}>{checkoutPackageId === pack.id ? "Starting Checkout..." : "Buy Package"}</Button>
            </Card>
          ))}
        </div> : <Card className="mt-5"><EmptyState icon={<Coins />} title="No packages available" body="DoroCoin packages have not been configured yet." action={<Button onClick={loadWallet}>Retry</Button>} /></Card>}
        {status ? <p className={`mt-5 rounded-[8px] p-4 font-bold ${status.startsWith("Checkout started") || status.startsWith("Development checkout") ? "bg-emerald-950/40 text-emerald-200" : "bg-red-950/40 text-red-200"}`}>{status}</p> : null}
      </section> : null}
    </AppShell>
  );
}

function CashMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold)]">${(value / 100).toFixed(2)}</p></div>;
}

