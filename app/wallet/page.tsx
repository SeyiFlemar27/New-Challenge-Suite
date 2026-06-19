"use client";

import { useEffect, useState } from "react";
import { Coins, LockKeyhole, TrendingUp, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { money } from "@/lib/utils";
import { fetchDoroCoinPackages, fetchWallet, purchaseDoroCoins } from "@/lib/api/services";

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

    setStatus("Checkout started. Your wallet updates after Stripe confirms payment.");
    window.location.href = result.data.url;
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Wallet / DoroCoin" subtitle="Use DoroCoins for votes, challenge boosts, premium entries, and rewards." icon={<Coins className="text-[var(--gold)]" />} />
        <Card className="px-7 py-5 text-right">
          <div className="text-sm font-bold text-slate-400">Available Balance</div>
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

      {!loading && !unauthenticated && !error ? <div className="mt-8 grid gap-6 xl:grid-cols-4">
        {[
          { icon: <Vote />, title: "Voting", body: "Buy additional votes for eligible submissions." },
          { icon: <TrendingUp />, title: "Boosting", body: "Increase challenge visibility for a fixed duration." },
          { icon: <LockKeyhole />, title: "Premium Entries", body: "Join locked creator challenges when allowed." },
          { icon: <Coins />, title: "Rewards", body: "Earn bonuses from wins, promos, and platform campaigns." }
        ].map((item) => <Card key={item.title} className="p-5"><div className="text-[var(--gold)]">{item.icon}</div><h2 className="mt-3 text-xl font-black">{item.title}</h2><p className="mt-2 text-sm text-slate-300">{item.body}</p></Card>)}
      </div> : null}

      {!loading && !unauthenticated && !error ? <section className="mt-10">
        <h2 className="text-2xl font-black">Buy DoroCoins</h2>
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
        {status ? <p className={`mt-5 rounded-[8px] p-4 font-bold ${status.startsWith("Checkout started") ? "bg-emerald-950/40 text-emerald-200" : "bg-red-950/40 text-red-200"}`}>{status}</p> : null}
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
          )) : <EmptyState icon={<Coins />} title="No transactions yet" body="Purchases, votes, boosts, rewards, and grants will appear here." />}
        </Card>
      </section> : null}
    </AppShell>
  );
}
