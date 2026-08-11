"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Check, Coins, History, PlayCircle, Search, ShieldCheck, ShoppingBag, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, PageTitle, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchDoroCoinPackages, fetchWallet, purchaseCustomDoroCoinsByUsd, purchaseDoroCoins } from "@/lib/api/services";
import { quoteCustomDoroCoinPurchase } from "@/lib/dorocoin-purchase";

const tabs = ["overview", "earn", "buy", "transfer", "history"] as const;
type Tab = typeof tabs[number];
type DoroPackage = { id: string; name: string; coins: number; baseCoins: number; bonusCoins: number; price: number; bestFor: string; mostPopular: boolean };
type DoroTransaction = { id: string; type?: string; sourceType?: string; status?: string; description?: string; reason?: string; amount?: number; signedAmount?: number; createdAt?: string | null };
type AdAvailability = { available: boolean; rewardAmount: number; adConsecutiveLimit: number; adCooldownMinutes: number };
type EconomySummary = { balances: { cash: { availableCents: number }; doroCoins: { balance: number }; challengeCredits: { balance: number }; creatorGrowthWallet: { balanceCents: number } }; streak: { current: number; lastRewardDay?: string | null; awardedMilestones: number[] }; doroCoinActivity?: { earnedToday: number; pendingOrReviewCount: number; reversedCount: number } };
type Recipient = { id: string; displayName: string; username: string | null; avatarUrl: string | null; emailHint: string | null };
type TransferLimits = { balance: number; minimum: number; maximum: number; dailyMaximum: number; transferredToday: number; remainingToday: number };
type HistoryFilter = "all" | "earned" | "purchased" | "spent" | "transferred" | "reversed" | "expired" | "pending";

const earningRules = [
  ["Daily login", "10", "Once per day"], ["Watch a challenge video", "2", "Up to 20 per day"],
  ["Like a challenge", "1", "Up to 50 eligible likes per day"], ["Comment on a challenge", "3", "Up to 20 eligible comments per day"],
  ["Share a challenge", "5", "Up to 10 eligible shares per day"], ["Invite a new user", "50", "After verified signup"],
  ["Create a free challenge", "25", "Once per eligible challenge"], ["Join a free challenge", "20", "Once per eligible challenge"],
  ["Win a free challenge", "150", "After winner approval"], ["Finish in the top 10", "75", "After results approval"],
  ["Complete profile verification", "100", "Once after provider verification"], ["Watch a sponsored advertisement", "5-10", "Verified provider callback required"]
] as const;

export default function DoroCoinsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<DoroPackage[]>([]);
  const [coinsPerUsd, setCoinsPerUsd] = useState(100);
  const [transactions, setTransactions] = useState<DoroTransaction[]>([]);
  const [ads, setAds] = useState<AdAvailability | null>(null);
  const [customUsd, setCustomUsd] = useState("5.00");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [economy, setEconomy] = useState<EconomySummary | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferLimits, setTransferLimits] = useState<TransferLimits | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const quote = useMemo(() => quoteCustomDoroCoinPurchase(Number(customUsd)), [customUsd]);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (value && tabs.includes(value)) setActiveTab(value);
  }, []);

  function chooseTab(tab: Tab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function load() {
    setLoading(true);
    const [walletResult, packageResult, adResult, economyResult, transferResult] = await Promise.all([
      fetchWallet(), fetchDoroCoinPackages(), apiRequest<AdAvailability>("/api/ad-votes"),
      apiRequest<EconomySummary>("/api/economy/summary"), apiRequest<TransferLimits>("/api/dorocoin/transfer")
    ]);
    if (walletResult.ok && walletResult.data) {
      setBalance(Number(walletResult.data.wallet?.balance ?? 0));
      setTransactions((walletResult.data.transactions ?? []) as DoroTransaction[]);
    } else setMessage(walletResult.message || "DoroCoin activity could not be loaded.");
    if (packageResult.ok && packageResult.data) {
      setPackages((packageResult.data.packages ?? []) as DoroPackage[]);
      setCoinsPerUsd(Number(packageResult.data.coinsPerUsd ?? 100));
    }
    if (adResult.ok && adResult.data) setAds(adResult.data);
    if (economyResult.ok && economyResult.data) setEconomy(economyResult.data);
    if (transferResult.ok && transferResult.data) setTransferLimits(transferResult.data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (recipientQuery.trim().length < 2 || selectedRecipient) { setRecipients([]); return; }
    const timer = window.setTimeout(() => {
      apiRequest<{ recipients: Recipient[] }>(`/api/dorocoin/recipients?q=${encodeURIComponent(recipientQuery.trim())}`)
        .then((result) => setRecipients(result.ok ? result.data?.recipients ?? [] : []));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [recipientQuery, selectedRecipient]);

  function openCheckout(url?: string | null) { if (url) window.location.assign(url); else setMessage("Secure checkout could not be started."); }
  async function buyCustom() { if (!quote) return; setBusy("custom"); setMessage(""); const result = await purchaseCustomDoroCoinsByUsd(quote.amountUsd); setBusy(null); if (!result.ok) return setMessage(result.message); openCheckout(result.data?.url); }
  async function buyPackage(packageId: string) { setBusy(packageId); setMessage(""); const result = await purchaseDoroCoins(packageId); setBusy(null); if (!result.ok) return setMessage(result.message); openCheckout(result.data?.url); }
  async function dailyLogin() { setBusy("daily"); const result = await apiRequest("/api/dorocoin/daily-login", { method: "POST" }); setBusy(null); setMessage(result.message); if (result.ok) await load(); }
  async function transfer() {
    if (!selectedRecipient) return;
    setBusy("transfer"); setMessage("");
    const result = await apiRequest("/api/dorocoin/transfer", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ receiverId: selectedRecipient.id, amount: Number(transferAmount), note: transferNote.trim() || undefined }) });
    setBusy(null); setConfirmTransfer(false); setMessage(result.message);
    if (result.ok) { setTransferAmount(""); setTransferNote(""); setRecipientQuery(""); setSelectedRecipient(null); await load(); }
  }

  const amount = Number(transferAmount);
  const transferBlocker = !selectedRecipient ? "Choose a recipient." : !Number.isInteger(amount) || amount <= 0 ? "Enter a whole DoroCoin amount." : amount > balance ? "Your balance is too low for this transfer." : transferLimits && amount < transferLimits.minimum ? `Minimum transfer is ${transferLimits.minimum.toLocaleString()} DoroCoins.` : transferLimits && amount > Math.min(transferLimits.maximum, transferLimits.remainingToday) ? "This amount exceeds your remaining transfer limit." : null;
  const filteredTransactions = useMemo(() => transactions.filter((item) => historyFilter === "all" || historyCategory(item) === historyFilter), [transactions, historyFilter]);
  const checkedInToday = economy?.streak.lastRewardDay === new Date().toISOString().slice(0, 10);
  const nextMilestone = [7, 30, 90, 365].find((value) => value > Number(economy?.streak.current ?? 0)) ?? 365;
  const milestoneReward: Record<number, number> = { 7: 250, 30: 2000, 90: 5000, 365: 25000 };

  return <AppShell>
    <div className="mx-auto w-full max-w-7xl">
      <PageTitle title="DoroCoins" subtitle="Earn, buy, transfer, and use DoroCoins across eligible Challenge Suite community features." />
      <section className="mt-7 overflow-hidden rounded-[8px] border border-yellow-300 bg-gradient-to-br from-white to-yellow-50 p-6 text-slate-950 shadow-sm sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-sm font-bold text-yellow-800">Available Balance</p>{loading ? <div className="mt-3 h-14 w-64 animate-pulse rounded-[8px] bg-yellow-100" aria-label="Loading DoroCoin balance" /> : <p className="mt-2 text-5xl font-black tracking-normal text-yellow-800 sm:text-6xl">{balance.toLocaleString()} DoroCoins</p>}<p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">DoroCoins are a virtual platform currency. They are not cash, are not legal tender, and cannot currently be withdrawn or converted to cash.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]"><Button onClick={() => chooseTab("earn")}>Earn DoroCoins</Button><Button variant="secondary" onClick={() => chooseTab("buy")}>Buy DoroCoins</Button><Button variant="secondary" onClick={() => chooseTab("transfer")}>Transfer</Button><Button variant="secondary" onClick={() => chooseTab("history")}>View History</Button></div></div>
      </section>

      <div className="mt-6 overflow-x-auto border-b border-[var(--line)]" role="tablist" aria-label="DoroCoin wallet sections">
        <div className="flex min-w-max gap-1">{tabs.map((tab, index) => <button key={tab} ref={(node) => { tabRefs.current[index] = node; }} role="tab" aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => chooseTab(tab)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; chooseTab(tabs[next]); tabRefs.current[next]?.focus(); }} className={`min-h-12 border-b-2 px-5 text-sm font-bold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${activeTab === tab ? "border-yellow-500 text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{tab}</button>)}</div>
      </div>

      {message ? <div role="status" className="mt-5 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-4 text-sm text-[var(--foreground)]">{message}</div> : null}

      <div id={`panel-${activeTab}`} role="tabpanel" className="mt-7">
        {activeTab === "overview" ? <Overview economy={economy} balance={balance} ads={ads} checkedInToday={checkedInToday} nextMilestone={nextMilestone} milestoneReward={milestoneReward[nextMilestone]} busy={busy} dailyLogin={dailyLogin} chooseTab={chooseTab} /> : null}
        {activeTab === "earn" ? <EarnTab ads={ads} /> : null}
        {activeTab === "buy" ? <BuyTab packages={packages} quote={quote} customUsd={customUsd} setCustomUsd={setCustomUsd} coinsPerUsd={coinsPerUsd} busy={busy} buyCustom={buyCustom} buyPackage={buyPackage} loading={loading} /> : null}
        {activeTab === "transfer" ? <TransferTab balance={balance} limits={transferLimits} query={recipientQuery} setQuery={(value) => { setRecipientQuery(value); setSelectedRecipient(null); }} recipients={recipients} selected={selectedRecipient} select={setSelectedRecipient} amount={transferAmount} setAmount={setTransferAmount} note={transferNote} setNote={setTransferNote} blocker={transferBlocker} openConfirm={() => setConfirmTransfer(true)} /> : null}
        {activeTab === "history" ? <HistoryTab transactions={filteredTransactions} filter={historyFilter} setFilter={setHistoryFilter} /> : null}
      </div>
    </div>
    {confirmTransfer && selectedRecipient ? <TransferConfirmation recipient={selectedRecipient} amount={amount} busy={busy === "transfer"} close={() => setConfirmTransfer(false)} confirm={transfer} /> : null}
  </AppShell>;
}

function Overview({ economy, balance, ads, checkedInToday, nextMilestone, milestoneReward, busy, dailyLogin, chooseTab }: { economy: EconomySummary | null; balance: number; ads: AdAvailability | null; checkedInToday: boolean; nextMilestone: number; milestoneReward: number; busy: string | null; dailyLogin: () => void; chooseTab: (tab: Tab) => void }) {
  return <div className="grid gap-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><BalanceCard label="DoroCoins" value={Number(economy?.balances.doroCoins.balance ?? balance).toLocaleString()} note="Non-cash engagement currency" dominant /><BalanceCard label="Cash Wallet" value={`$${(Number(economy?.balances.cash.availableCents ?? 0) / 100).toFixed(2)}`} note="Withdrawable only when KYC and withdrawal rules allow" /><BalanceCard label="Challenge Credits" value={Number(economy?.balances.challengeCredits.balance ?? 0).toLocaleString()} note="Premium credits, not withdrawable" /><BalanceCard label="Creator Growth Wallet" value={`$${(Number(economy?.balances.creatorGrowthWallet.balanceCents ?? 0) / 100).toFixed(2)}`} note="Restricted growth tools only" /></div><div className="grid gap-6 lg:grid-cols-2"><Card className="p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Daily streak</h2><p className="mt-2 text-3xl font-black">{economy?.streak.current ?? 0} days</p></div><Sparkles className="text-yellow-600" /></div><p className="mt-4 text-sm text-[var(--muted)]">Next milestone: {nextMilestone}-day streak - {milestoneReward.toLocaleString()} DoroCoins. A missed day resets the streak.</p><Button className="mt-5" disabled={checkedInToday || busy === "daily"} onClick={dailyLogin}>{checkedInToday ? "Checked in today" : busy === "daily" ? "Checking in..." : "Check In Today"}</Button></Card><Card className="p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Rewarded ads</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{ads?.available ? `Earn ${ads.rewardAmount} DoroCoins after each verified sponsor ad.` : "Rewarded ads are not available yet. Once enabled, you will be able to earn DoroCoins by watching verified sponsor ads."}</p></div><PlayCircle className="text-yellow-600" /></div><Button className="mt-5" disabled={!ads?.available}>{ads?.available ? "Watch Rewarded Ad" : "Not Available Yet"}</Button></Card></div><div className="grid gap-3 sm:grid-cols-3"><Metric label="Earned today" value={`${economy?.doroCoinActivity?.earnedToday ?? 0} DoroCoins`} /><Metric label="Pending or under review" value={String(economy?.doroCoinActivity?.pendingOrReviewCount ?? 0)} /><Metric label="Reversed entries" value={String(economy?.doroCoinActivity?.reversedCount ?? 0)} /></div><Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">Ready for your next move?</h2><p className="mt-2 text-sm text-[var(--muted)]">Explore earning options or review every confirmed wallet activity.</p></div><div className="flex flex-wrap gap-3"><Button onClick={() => chooseTab("earn")}>Ways to Earn</Button><Button variant="secondary" onClick={() => chooseTab("history")}>View History</Button></div></Card></div>;
}

function EarnTab({ ads }: { ads: AdAvailability | null }) { return <div className="grid gap-7"><div><h2 className="text-2xl font-black">Ways to Earn DoroCoins</h2><p className="mt-2 text-[var(--muted)]">Only eligible, server-verified activity earns DoroCoins. Daily caps and reversals help prevent farming.</p></div><div className="overflow-hidden rounded-[8px] border border-[var(--line)]"><div className="hidden grid-cols-[1fr_120px_1fr] bg-[var(--panel-2)] px-5 py-3 text-xs font-black uppercase text-[var(--muted)] md:grid"><span>Activity</span><span>Reward</span><span>Eligibility</span></div>{earningRules.map(([name, reward, eligibility]) => <div key={name} className="grid gap-2 border-t border-[var(--line)] bg-[var(--panel)] p-5 md:grid-cols-[1fr_120px_1fr] md:items-center"><strong>{name}</strong><span className="font-black text-yellow-700">{reward} DoroCoins</span><span className="text-sm text-[var(--muted)]">{eligibility}</span></div>)}</div><Card className="p-6"><h3 className="text-xl font-black">Rewarded ads</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{ads?.available ? `Verified ads currently award ${ads.rewardAmount} DoroCoins, with a ${ads.adConsecutiveLimit}-ad cycle limit and ${ads.adCooldownMinutes}-minute cooldown.` : "Rewarded ads are not available yet. Once enabled, you will be able to earn DoroCoins by watching verified sponsor ads."}</p><Button className="mt-5" disabled={!ads?.available}>{ads?.available ? "Watch Rewarded Ad" : "Not Available Yet"}</Button></Card><Card className="p-6"><h3 className="text-xl font-black">Ways to Use DoroCoins</h3><p className="mt-3 leading-7 text-[var(--muted)]">Use DoroCoins for eligible community entries, visibility boosts, profile cosmetics, badges, gifts, seasonal activities, and approved promotional items. DoroCoins cannot buy votes, premium memberships, or cash.</p></Card></div>; }

function BuyTab({ packages, quote, customUsd, setCustomUsd, coinsPerUsd, busy, buyCustom, buyPackage, loading }: { packages: DoroPackage[]; quote: ReturnType<typeof quoteCustomDoroCoinPurchase>; customUsd: string; setCustomUsd: (value: string) => void; coinsPerUsd: number; busy: string | null; buyCustom: () => void; buyPackage: (id: string) => void; loading: boolean }) { return <div className="grid gap-8"><div><h2 className="text-2xl font-black">Buy DoroCoins</h2><p className="mt-2 text-[var(--muted)]">Secure provider checkout. DoroCoins are credited only after payment confirmation.</p></div>{packages.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{packages.map((pack, index) => <Card key={pack.id} className="flex min-h-[300px] flex-col p-6">{pack.mostPopular ? <span className="w-fit rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-900">Best value</span> : <span className="h-6" />}<h3 className="mt-4 text-xl font-black">{packageName(pack.name, index)}</h3><p className="mt-4 text-4xl font-black text-yellow-700">{pack.coins.toLocaleString()}</p><p className="text-sm font-bold text-[var(--muted)]">DoroCoins</p>{pack.bonusCoins > 0 ? <p className="mt-3 text-sm font-bold text-emerald-700">Includes {pack.bonusCoins.toLocaleString()} bonus coins</p> : null}<p className="mt-3 flex-1 text-sm leading-6 text-[var(--muted)]">{pack.bestFor || "Available DoroCoin package"}</p><div className="mt-5 flex items-end justify-between"><b className="text-2xl">${Number(pack.price).toFixed(2)}</b><span className="text-xs text-[var(--muted)]">Secure checkout</span></div><Button className="mt-5 w-full" disabled={Boolean(busy)} onClick={() => buyPackage(pack.id)}>{busy === pack.id ? "Preparing..." : "Buy"}</Button></Card>)}</div> : !loading ? <Card><EmptyState title="Packages are being updated" body="No consistently priced packages are available right now. Custom secure checkout remains available below." /></Card> : null}<Card className="p-6 sm:p-8"><div className="grid gap-8 lg:grid-cols-2"><div><h3 className="text-xl font-black">Choose a custom amount</h3><p className="mt-2 text-sm text-[var(--muted)]">${1} = {coinsPerUsd.toLocaleString()} DoroCoins. Enter $1.00 to $200.00.</p><Field label="Amount in USD"><input className={`${inputClass} mt-5`} type="number" min="1" max="200" step="0.01" value={customUsd} onChange={(event) => setCustomUsd(event.target.value)} /></Field></div><div className="rounded-[8px] border border-yellow-300 bg-yellow-50 p-5 text-slate-950"><p className="text-sm font-bold text-slate-600">Conversion preview</p><p className="mt-3 text-4xl font-black">{quote?.coins.toLocaleString() ?? "-"}</p><p className="text-sm font-bold text-slate-600">DoroCoins</p><p className="mt-5 text-lg font-black">Total: {quote ? `$${quote.amountUsd.toFixed(2)}` : "Enter a valid amount"}</p><Button className="mt-5 w-full" disabled={!quote || Boolean(busy)} onClick={buyCustom}>{busy === "custom" ? "Preparing checkout..." : "Continue to Secure Checkout"}</Button></div></div></Card></div>; }

function TransferTab({ balance, limits, query, setQuery, recipients, selected, select, amount, setAmount, note, setNote, blocker, openConfirm }: { balance: number; limits: TransferLimits | null; query: string; setQuery: (value: string) => void; recipients: Recipient[]; selected: Recipient | null; select: (recipient: Recipient) => void; amount: string; setAmount: (value: string) => void; note: string; setNote: (value: string) => void; blocker: string | null; openConfirm: () => void }) { return <div className="mx-auto grid max-w-4xl gap-6"><div><h2 className="text-2xl font-black">Transfer DoroCoins</h2><p className="mt-2 text-[var(--muted)]">Transfers are server-authorized, ledger-backed, and cannot be sent to your own account.</p></div><div className="grid gap-3 sm:grid-cols-3"><Metric label="Available balance" value={`${balance.toLocaleString()} DoroCoins`} /><Metric label="Daily limit" value={`${Number(limits?.dailyMaximum ?? 0).toLocaleString()} DoroCoins`} /><Metric label="Remaining today" value={`${Number(limits?.remainingToday ?? 0).toLocaleString()} DoroCoins`} /></div><Card className="p-6 sm:p-8"><Field label="Search username, email, or profile name"><div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} /><input className={`${inputClass} pl-11`} value={selected ? selected.displayName : query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a recipient" autoComplete="off" /></div></Field>{recipients.length && !selected ? <div className="mt-2 overflow-hidden rounded-[8px] border border-[var(--line)]">{recipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => select(recipient)} className="flex min-h-16 w-full items-center gap-3 border-b border-[var(--line)] px-4 text-left hover:bg-yellow-50"><Avatar recipient={recipient} /><span><b>{recipient.displayName}</b><small className="block text-[var(--muted)]">{recipient.username ? `@${recipient.username}` : recipient.emailHint}</small></span></button>)}</div> : null}{selected ? <div className="mt-4 flex items-center justify-between rounded-[8px] border border-yellow-300 bg-yellow-50 p-4 text-slate-950"><div className="flex items-center gap-3"><Avatar recipient={selected} /><span><b>{selected.displayName}</b><small className="block text-slate-600">{selected.username ? `@${selected.username}` : selected.emailHint}</small></span></div><button type="button" aria-label="Clear recipient" onClick={() => setQuery("")}><X /></button></div> : null}<div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="DoroCoins"><input className={inputClass} type="number" min={limits?.minimum ?? 10} max={Math.min(limits?.maximum ?? 10000, limits?.remainingToday ?? 10000)} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="Note (optional)"><input className={inputClass} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short note" /></Field></div>{blocker ? <p className="mt-4 text-sm font-bold text-[var(--muted)]">{blocker}</p> : null}<Button className="mt-6" disabled={Boolean(blocker)} onClick={openConfirm}>Review Transfer</Button></Card></div>; }

function HistoryTab({ transactions, filter, setFilter }: { transactions: DoroTransaction[]; filter: HistoryFilter; setFilter: (filter: HistoryFilter) => void }) { const filters: HistoryFilter[] = ["all", "earned", "purchased", "spent", "transferred", "reversed", "expired", "pending"]; return <div className="grid gap-6"><div><h2 className="text-2xl font-black">DoroCoin History</h2><p className="mt-2 text-[var(--muted)]">Confirmed purchases, eligible rewards, spends, transfers, reversals, and review states from your real ledger.</p></div><div className="flex gap-2 overflow-x-auto pb-2" aria-label="History filters">{filters.map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold capitalize ${filter === item ? "border-yellow-500 bg-yellow-100 text-yellow-950" : "border-[var(--line)] bg-[var(--panel)]"}`}>{item}</button>)}</div><Card className="overflow-hidden">{transactions.length ? transactions.map((item) => { const value = transactionAmount(item); const status = historyStatus(item); return <div key={item.id} className="grid gap-3 border-b border-[var(--line)] p-5 sm:grid-cols-[120px_1fr_130px_110px] sm:items-center"><span className="text-sm text-[var(--muted)]">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Pending"}</span><span><b>{historyLabel(item)}</b><small className="mt-1 block capitalize text-[var(--muted)]">{historyCategory(item)}</small></span><span className={`text-lg font-black sm:text-right ${value >= 0 ? "text-emerald-700" : "text-red-700"}`}>{value > 0 ? "+" : ""}{value.toLocaleString()}</span><StatusBadge status={status} /></div>; }) : <EmptyState title="No matching activity" body="Confirmed DoroCoin activity in this category will appear here." />}</Card></div>; }

function TransferConfirmation({ recipient, amount, busy, close, confirm }: { recipient: Recipient; amount: number; busy: boolean; close: () => void; confirm: () => void }) { useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [close]); return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-confirm-title"><div className="w-full max-w-lg rounded-[8px] bg-white p-6 text-slate-950 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 id="transfer-confirm-title" className="text-2xl font-black">Confirm transfer</h2><p className="mt-3 leading-7 text-slate-600">You are sending <b>{amount.toLocaleString()} DoroCoins</b> to <b>{recipient.displayName}</b>.</p></div><button type="button" aria-label="Close transfer confirmation" onClick={close}><X /></button></div><div className="mt-5 rounded-[8px] border border-yellow-300 bg-yellow-50 p-4 text-sm leading-6">DoroCoins are not cash and cannot currently be withdrawn.</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={busy} onClick={confirm}>{busy ? "Sending..." : "Confirm Transfer"}</Button></div></div></div>; }

function BalanceCard({ label, value, note, dominant = false }: { label: string; value: string; note: string; dominant?: boolean }) { return <Card className={`p-5 ${dominant ? "border-yellow-400 bg-yellow-50 text-slate-950" : ""}`}><p className="text-sm font-bold text-[var(--muted)]">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{note}</p></Card>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-4"><p className="text-xs font-bold text-[var(--muted)]">{label}</p><p className="mt-1 font-black">{value}</p></div>; }
function Avatar({ recipient }: { recipient: Recipient }) { return recipient.avatarUrl ? <img src={recipient.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-yellow-200 font-black text-yellow-950">{recipient.displayName.slice(0, 1).toUpperCase()}</span>; }
function packageName(name: string, index: number) { const clean = name.trim(); if (clean && !/admin|config/i.test(clean)) return clean; return ["Starter", "Growth", "Creator", "Pro", "Elite"][index] ?? "DoroCoin Package"; }
function transactionAmount(item: DoroTransaction) { return Number(item.signedAmount ?? item.amount ?? 0); }
function historyCategory(item: DoroTransaction): HistoryFilter { const value = `${item.type ?? ""} ${item.sourceType ?? ""} ${item.status ?? ""}`.toLowerCase(); if (/pending|review/.test(value)) return "pending"; if (/reversal|reversed/.test(value)) return "reversed"; if (/expir/.test(value)) return "expired"; if (/purchase/.test(value)) return "purchased"; if (/transfer/.test(value)) return "transferred"; if (transactionAmount(item) < 0 || /spend|boost/.test(value)) return "spent"; return "earned"; }
function historyStatus(item: DoroTransaction) { const value = String(item.status ?? "confirmed").toLowerCase(); if (value.includes("review")) return "Under review"; if (value.includes("pending")) return "Pending"; if (value.includes("revers")) return "Reversed"; if (value.includes("expir")) return "Expired"; if (value.includes("fail")) return "Failed"; return "Confirmed"; }
function historyLabel(item: DoroTransaction) { const source = String(item.sourceType ?? item.type ?? "activity"); const labels: Record<string, string> = { daily_login: "Daily login reward", admin_grant: "Admin reward", vote_spend: "Vote spend", purchase: "Purchased DoroCoins", transfer_in: "Transfer received", transfer_out: "Transfer sent", expiry: "Expired DoroCoins", reversal: "Reversal", sponsored_ad_watch: "Sponsored ad reward", streak_bonus: "Streak reward" }; const description = String(item.description ?? item.reason ?? labels[source] ?? source.replaceAll("_", " ")).replace(/\bdemo\b/gi, "").replace(/\s{2,}/g, " ").trim(); return description || labels[source] || "DoroCoin activity"; }
function StatusBadge({ status }: { status: string }) { const tone = status === "Confirmed" ? "bg-emerald-100 text-emerald-800" : status === "Failed" || status === "Reversed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"; return <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${tone}`}>{status}</span>; }
