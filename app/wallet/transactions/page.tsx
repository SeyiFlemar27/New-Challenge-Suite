"use client";

import { useEffect, useState } from "react";
import { Coins, History, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchWallet } from "@/lib/api/services";

type TransactionRecord = { id: string; type: string; description: string; amount: number; createdAt?: string | null };

function formatDate(value?: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatType(type: string) {
  return type.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function WalletTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);

  async function loadTransactions() {
    setLoading(true);
    setError(null);
    setUnauthenticated(false);
    const result = await fetchWallet();
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Transactions could not be loaded.");
      setLoading(false);
      return;
    }
    setTransactions((result.data.transactions ?? []).map((txn) => {
      const record = txn as Partial<TransactionRecord>;
      return {
        id: String(record.id ?? ""),
        type: String(record.type ?? "adjustment"),
        description: String(record.description ?? "DoroCoin transaction"),
        amount: Number(record.amount ?? 0),
        createdAt: record.createdAt ?? null
      };
    }));
    setLoading(false);
  }

  useEffect(() => { loadTransactions(); }, []);

  return (
    <AppShell>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Transaction History" subtitle="Your DoroCoin purchases and spending activity will appear here." icon={<History className="text-[var(--gold)]" />} />
        <LinkButton href="/wallet" variant="secondary">Back to Wallet</LinkButton>
      </div>
      {loading ? <div className="mt-8 space-y-4">{[0, 1, 2].map((item) => <Card key={item} className="h-20 animate-pulse bg-[#151515]" />)}</div> : unauthenticated ? <Card className="mt-8"><EmptyState icon={<LockKeyhole />} title="Sign in required" body={error ?? "Sign in to view your DoroCoin transaction history."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} /></Card> : error ? <Card className="mt-8"><EmptyState icon={<Coins />} title="Transactions unavailable" body={error} action={<Button onClick={loadTransactions}>Retry</Button>} /></Card> : transactions.length ? <Card className="mt-8 overflow-hidden"><div className="hidden border-b border-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 md:grid md:grid-cols-[140px_1fr_140px_120px]"><span>Date</span><span>Description</span><span>Type</span><span className="text-right">Amount</span></div>{transactions.map((txn) => <div key={txn.id} className="grid gap-2 border-b border-white/10 p-5 md:grid-cols-[140px_1fr_140px_120px] md:items-center"><span className="font-bold text-slate-300">{formatDate(txn.createdAt)}</span><span>{txn.description}</span><span className="text-sm font-bold text-slate-400">{formatType(txn.type)}</span><span className={`font-black md:text-right ${txn.amount > 0 ? "text-emerald-300" : "text-red-300"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount}</span></div>)}</Card> : <Card className="mt-8"><EmptyState icon={<Coins />} title="No transactions yet" body="Your DoroCoin purchases and spending activity will appear here." /></Card>}
    </AppShell>
  );
}