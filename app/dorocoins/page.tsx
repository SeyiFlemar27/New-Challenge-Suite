"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, History, PlayCircle, ShoppingCart, Sparkles, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchDoroCoinPackages, fetchWallet, purchaseCustomDoroCoinsByUsd, purchaseDoroCoins } from "@/lib/api/services";
import { quoteCustomDoroCoinPurchase } from "@/lib/dorocoin-purchase";

type DoroPackage = { id: string; name: string; coins: number; baseCoins: number; bonusCoins: number; price: number; bestFor: string; mostPopular: boolean };
type DoroTransaction = { id: string; type?: string; description?: string; amount?: number; createdAt?: string | null };
type AdAvailability = { available: boolean; rewardAmount: number; adConsecutiveLimit: number; adCooldownMinutes: number };

export default function DoroCoinsPage() {
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<DoroPackage[]>([]);
  const [transactions, setTransactions] = useState<DoroTransaction[]>([]);
  const [ads, setAds] = useState<AdAvailability | null>(null);
  const [customUsd, setCustomUsd] = useState("1.00");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const quote = useMemo(() => quoteCustomDoroCoinPurchase(Number(customUsd)), [customUsd]);

  async function load() {
    setLoading(true);
    const [walletResult, packageResult, adResult] = await Promise.all([
      fetchWallet(),
      fetchDoroCoinPackages(),
      apiRequest<AdAvailability>("/api/ad-votes")
    ]);
    if (walletResult.ok && walletResult.data) {
      setBalance(Number(walletResult.data.wallet?.balance ?? 0));
      setTransactions((walletResult.data.transactions ?? []) as DoroTransaction[]);
    } else setMessage(walletResult.message || "DoroCoin activity could not be loaded.");
    if (packageResult.ok && packageResult.data) setPackages((packageResult.data.packages ?? []) as DoroPackage[]);
    if (adResult.ok && adResult.data) setAds(adResult.data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openCheckout(url?: string | null) {
    if (url) window.location.assign(url);
    else setMessage("Checkout could not be started.");
  }

  async function buyCustom() {
    if (!quote) return;
    setBusy("custom");
    setMessage("");
    const result = await purchaseCustomDoroCoinsByUsd(quote.amountUsd);
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    openCheckout(result.data?.url);
  }

  async function buyPackage(packageId: string) {
    setBusy(packageId);
    setMessage("");
    const result = await purchaseDoroCoins(packageId);
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    openCheckout(result.data?.url);
  }

  return <AppShell>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <PageTitle title="DoroCoins" subtitle="Buy and use non-cash platform credits for eligible voting, boosts, and rewards." icon={<Coins />} />
      <Card className="min-w-[240px] border-yellow-400/30 bg-yellow-400/10 p-5">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Available balance</p>
        <p className="mt-2 text-4xl font-black text-[var(--gold)]">{loading ? "..." : balance.toLocaleString()}</p>
      </Card>
    </div>

    <p className="mt-6 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 px-4 py-3 text-sm text-slate-300">DoroCoins are internal credits, not cash. They cannot be withdrawn or converted to cash.</p>

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-3"><ShoppingCart className="mt-1 text-[var(--gold)]" /><div><h2 className="text-2xl font-black">Custom purchase</h2><p className="mt-2 text-sm text-slate-400">$1.00 buys 50 DoroCoins. Your final quote is rounded to whole DoroCoins.</p></div></div>
        <label className="mt-6 block"><span className="mb-2 block text-sm font-bold">Amount in USD</span><input className="min-h-12 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4 text-lg font-black outline-none focus:border-[var(--gold)]" type="number" min="1" max="200" step="0.01" value={customUsd} onChange={(event) => setCustomUsd(event.target.value)} /></label>
        {quote ? <div className="mt-5 grid gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4 sm:grid-cols-2"><Quote label="Final price" value={`$${quote.amountUsd.toFixed(2)}`} /><Quote label="DoroCoins" value={quote.coins.toLocaleString()} /><Quote label="Bonus" value={`${quote.bonusCoins}`} /><Quote label="Payment method" value="Secure checkout" /></div> : <p className="mt-3 text-sm font-bold text-red-200">Enter an amount from $1.00 to $200.00.</p>}
        <Button className="mt-5 w-full" disabled={!quote || Boolean(busy)} onClick={buyCustom}>{busy === "custom" ? "Preparing checkout..." : "Confirm & Continue"}</Button>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-3"><PlayCircle className="mt-1 text-[var(--gold)]" /><div><h2 className="text-2xl font-black">Earn from rewarded ads</h2><p className="mt-2 text-sm leading-6 text-slate-400">Verified completed ads can grant DoroCoins when the reward provider is active.</p></div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3"><Quote label="Per verified ad" value={`${ads?.rewardAmount ?? 3} coins`} /><Quote label="Cycle limit" value={`${ads?.adConsecutiveLimit ?? 10} ads`} /><Quote label="Cooldown" value={`${ads?.adCooldownMinutes ?? 120} min`} /></div>
        <Button className="mt-5 w-full" disabled={!ads?.available}>Watch Rewarded Ad</Button>
        {!ads?.available ? <p className="mt-3 text-sm text-slate-400">Rewarded ads are unavailable until server-verified provider callbacks are configured.</p> : null}
      </Card>
    </div>

    <section className="mt-10">
      <div className="flex items-center gap-3"><Sparkles className="text-[var(--gold)]" /><div><h2 className="text-2xl font-black">DoroCoin packages</h2><p className="mt-1 text-sm text-slate-400">Packages are loaded from active admin configuration.</p></div></div>
      {packages.length ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{packages.map((pack) => <Card key={pack.id} className="relative flex min-h-[280px] flex-col p-6">
        {pack.mostPopular ? <span className="absolute right-4 top-4 rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-black text-black">Most Popular</span> : null}
        <h3 className="pr-28 text-xl font-black">{pack.name}</h3><p className="mt-5 text-4xl font-black text-[var(--gold)]">{pack.coins.toLocaleString()}</p><p className="text-sm font-bold text-slate-400">DoroCoins</p>
        <p className="mt-3 text-sm text-slate-300">{pack.baseCoins.toLocaleString()} base{pack.bonusCoins > 0 ? ` + ${pack.bonusCoins.toLocaleString()} bonus` : ""}</p><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{pack.bestFor}</p>
        <div className="mt-5 flex items-end justify-between"><p className="text-2xl font-black">${Number(pack.price).toFixed(2)}</p><p className="text-xs text-slate-500">secure checkout</p></div><Button className="mt-5 w-full" disabled={Boolean(busy)} onClick={() => buyPackage(pack.id)}>{busy === pack.id ? "Preparing..." : "Buy Package"}</Button>
      </Card>)}</div> : !loading ? <Card className="mt-5"><EmptyState icon={<Coins />} title="No packages available" body="No active DoroCoin packages are configured." /></Card> : null}
    </section>

    <section className="mt-10">
      <div className="flex items-center gap-3"><History className="text-[var(--gold)]" /><div><h2 className="text-2xl font-black">Recent DoroCoin activity</h2><p className="mt-1 text-sm text-slate-400">Confirmed purchases, voting spend, boosts, and verified rewards.</p></div></div>
      <Card className="mt-5 overflow-hidden">{transactions.length ? transactions.slice(0, 20).map((item) => <div key={item.id} className="grid gap-2 border-b border-white/10 p-5 sm:grid-cols-[140px_1fr_120px] sm:items-center"><span className="text-sm text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Pending"}</span><span><b>{item.description || formatType(item.type)}</b><span className="mt-1 block text-xs text-slate-500">{formatType(item.type)}</span></span><span className={`text-lg font-black sm:text-right ${Number(item.amount) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}</span></div>) : <EmptyState icon={<Vote />} title="No DoroCoin activity yet" body="Confirmed purchases and eligible DoroCoin usage will appear here." />}</Card>
    </section>
    {message ? <p className="mt-6 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-200">{message}</p> : null}
  </AppShell>;
}

function Quote({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}

function formatType(value: unknown) {
  return String(value ?? "activity").split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
