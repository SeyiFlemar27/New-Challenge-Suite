"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Gift, History, Trophy, WalletCards, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const tiers = ["basic", "standard", "premium"] as const;
type RewardTier = (typeof tiers)[number];
type RewardPrize = { id: string; prizeName: string; prizeDescription?: string; prizeType?: string; rewardValue?: number; resolvedProbability?: number };
type BonusSpin = { id: string; tier?: string };
type SummaryData = { settings?: { rewardsEnabled?: boolean; maintenanceMode?: boolean; tierEnabled?: Record<string, boolean>; spinCosts?: Record<string, number> }; prizes?: Record<string, RewardPrize[]>; availableRewardPoints?: number; bonusSpins?: BonusSpin[] };
type Slice = RewardPrize & { startAngle: number; endAngle: number; midpoint: number; color: string; textColor: string };

const tierLabels: Record<RewardTier, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };
const fallbackCosts: Record<RewardTier, number> = { basic: 100, standard: 250, premium: 500 };
const palette = [
  { color: "#f6c64b", textColor: "#17120a" },
  { color: "#25231f", textColor: "#f8e7b3" },
  { color: "#d2a94b", textColor: "#15100a" },
  { color: "#f0dfad", textColor: "#18120b" },
  { color: "#171717", textColor: "#f6c64b" }
];
const center = 50;
const radius = 49;

function polar(angle: number, distance = radius) { const radians = (angle - 90) * Math.PI / 180; return { x: center + distance * Math.cos(radians), y: center + distance * Math.sin(radians) }; }
function arc(startAngle: number, endAngle: number) { const start = polar(endAngle); const end = polar(startAngle); return [`M ${center} ${center}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${endAngle - startAngle > 180 ? 1 : 0} 0 ${end.x} ${end.y}`, "Z"].join(" "); }
function buildSlices(prizes: RewardPrize[]): Slice[] { let cursor = 0; const total = prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.resolvedProbability ?? 0)), 0) || 1; return prizes.map((prize, index) => { const probability = Math.max(0, Number(prize.resolvedProbability ?? 0)) / total; const startAngle = cursor; const endAngle = index === prizes.length - 1 ? 360 : cursor + probability * 360; cursor = endAngle; return { ...prize, resolvedProbability: probability, startAngle, endAngle, midpoint: startAngle + (endAngle - startAngle) / 2, ...palette[index % palette.length] }; }); }
function shortLabel(value: string) { return value.length > 15 ? `${value.slice(0, 12)}...` : value; }
function rewardAction(type?: string) { if (type === "cash") return { href: "/earnings", label: "View Earnings" }; if (type === "physical_item") return { href: "/rewards/history", label: "Add Delivery Details" }; if (["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin", "badge"].includes(String(type))) return { href: "/rewards", label: "View Your Rewards" }; if (type === "dorocoin") return { href: "/dorocoins", label: "View DoroCoins" }; return { href: "/rewards/history", label: "View Reward History" }; }
function prizeAmount(prize: RewardPrize) { if (prize.prizeType === "cash") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(prize.rewardValue ?? 0) / 100); if (prize.prizeType === "dorocoin") return `${Number(prize.rewardValue ?? 0).toLocaleString()} DC`; return prize.prizeName; }

export default function RewardWheelPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [tier, setTier] = useState<RewardTier>("basic");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [paymentSource, setPaymentSource] = useState<"points" | "bonus_spin">("points");
  const [requesting, setRequesting] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const timeoutRef = useRef<number | null>(null);

  function load() { apiRequest<SummaryData>("/api/rewards/summary").then((response) => { if (response.ok) { setData(response.data ?? null); setMessage(""); } else setMessage(response.message || "Rewards could not load."); }); }
  useEffect(() => { load(); const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener?.("change", sync); return () => { media.removeEventListener?.("change", sync); if (timeoutRef.current) window.clearTimeout(timeoutRef.current); }; }, []);

  const points = Number(data?.availableRewardPoints ?? 0);
  const cost = Number(data?.settings?.spinCosts?.[tier] ?? fallbackCosts[tier]);
  const prizes = data?.prizes?.[tier] ?? [];
  const slices = useMemo(() => buildSlices(prizes), [prizes]);
  const tierBonus = (data?.bonusSpins ?? []).find((item) => !item.tier || item.tier === tier);
  const affordableSpins = Math.floor(points / Math.max(1, cost));
  const enabled = Boolean(data?.settings?.rewardsEnabled !== false && !data?.settings?.maintenanceMode && data?.settings?.tierEnabled?.[tier] !== false);
  const canOpenConfirmation = enabled && prizes.length > 0 && (Boolean(tierBonus) || points >= cost) && !requesting && !spinning;

  function openConfirmation() { if (!canOpenConfirmation) return; setPaymentSource(tierBonus ? "bonus_spin" : "points"); setConfirming(true); setMessage(""); }
  async function spin() {
    setRequesting(true); setConfirming(false); setResult(null); setMessage("Confirming your Spin...");
    const response = await apiRequest<any>("/api/rewards/spin", { method: "POST", body: JSON.stringify({ tier, idempotencyKey: crypto.randomUUID(), paymentSource, bonusEntitlementId: paymentSource === "bonus_spin" ? tierBonus?.id : null }) });
    setRequesting(false);
    if (!response.ok) { setMessage(response.message || "This Spin could not be completed. No Reward Points were charged."); return; }
    const spinResult = response.data?.spin;
    const selected = slices.find((slice) => slice.id === String(spinResult?.prizeId)) ?? slices[0];
    setMessage("Reward confirmed securely."); navigator.vibrate?.(15); if (reducedMotion) { setResult(spinResult); setMessage(""); load(); return; } setSpinning(true);
    setRotation((current) => current + 2160 + (360 - selected.midpoint));
    timeoutRef.current = window.setTimeout(() => { setSpinning(false); setResult(spinResult); setMessage(""); load(); }, 4200);
  }

  return <AppShell>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><PageTitle title="Spin & Win" subtitle="Choose a Spin tier, review the cost, and let the server select your reward from the published odds." icon={<Gift />} /><div className="flex flex-wrap gap-3"><LinkButton href="/rewards" variant="secondary"><ArrowLeft size={17} /> Rewards</LinkButton><LinkButton href="/rewards/history" variant="secondary"><History size={17} /> History</LinkButton></div></div>
    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden p-5 sm:p-8">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Spin tiers">{tiers.map((item) => <button key={item} type="button" role="tab" aria-selected={tier === item} onClick={() => { setTier(item); setResult(null); }} disabled={requesting || spinning} className={`min-h-11 flex-1 rounded-[8px] border px-4 text-sm font-black ${tier === item ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-white/5"}`}>{tierLabels[item]} · {Number(data?.settings?.spinCosts?.[item] ?? fallbackCosts[item])} points</button>)}</div>
        <div className="mx-auto mt-8 w-full max-w-[560px]">
          <div className="relative aspect-square"><div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[14px] border-t-[26px] border-x-transparent border-t-[var(--gold)]" aria-hidden="true" /><svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-2xl" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(.12,.7,.08,1)" : "none" }} aria-label={`${tierLabels[tier]} reward wheel`} role="img">{slices.map((slice) => { const label = polar(slice.midpoint, 32); return <g key={slice.id}><path d={arc(slice.startAngle, slice.endAngle)} fill={slice.color} stroke="#f7df9b" strokeWidth="0.35" /><text x={label.x} y={label.y} fill={slice.textColor} fontSize="3.1" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${slice.midpoint} ${label.x} ${label.y})`}>{shortLabel(slice.prizeName)}</text></g>; })}<circle cx="50" cy="50" r="9" fill="#111" stroke="#f6c64b" strokeWidth="1" /><text x="50" y="50" fill="#f6c64b" fontSize="3.4" fontWeight="900" textAnchor="middle" dominantBaseline="middle">SPIN</text></svg></div>
          <div className="mt-6 text-center"><p className="text-sm text-slate-400">{tierBonus ? "A Bonus Spin is available." : points >= cost ? `${affordableSpins} ${affordableSpins === 1 ? "Spin" : "Spins"} available with your current points.` : `Need ${(cost - points).toLocaleString()} more Reward Points.`}</p><Button onClick={openConfirmation} disabled={!canOpenConfirmation} className="mt-4 min-w-56"><Trophy size={18} /> {requesting ? "Confirming..." : spinning ? "Spinning..." : `Spin ${tierLabels[tier]}`}</Button></div>
        </div>
      </Card>
      <div className="space-y-6"><Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Reward Points</p><p className="mt-2 text-3xl font-black text-[var(--gold)]">{data ? points.toLocaleString() : "..."}</p><p className="mt-2 text-sm text-slate-400">This tier costs {cost.toLocaleString()} points.</p></Card><Card className="p-5"><h2 className="text-xl font-black">Possible Rewards</h2><p className="mt-2 text-sm text-slate-400">Odds reflect the rewards currently eligible for your account.</p><div className="mt-4 space-y-3">{slices.map((slice) => <div key={slice.id} className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 text-sm"><span className="font-bold">{slice.prizeName}</span><span className="tabular-nums text-slate-400">{(Number(slice.resolvedProbability) * 100).toFixed(2)}%</span></div>)}</div></Card></div>
    </div>
    {result ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="reward-result-title"><Card className="w-full max-w-lg p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-400" size={48} /><h2 id="reward-result-title" className="mt-4 text-3xl font-black">You won {prizeAmount(result)}</h2><p className="mt-3 text-slate-400">{result.prizeDescription}</p><p className="mt-4 rounded-[8px] bg-white/5 p-3 text-sm font-bold">Status: {String(result.fulfillmentStatus ?? "confirmed").replaceAll("_", " ")}</p><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><LinkButton href={rewardAction(result.prizeType).href}><WalletCards size={17} /> {rewardAction(result.prizeType).label}</LinkButton><Button variant="secondary" onClick={() => setResult(null)}>Close</Button></div></Card></div> : null}
    {confirming ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-spin-title"><Card className="w-full max-w-lg p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="confirm-spin-title" className="text-2xl font-black">Confirm {tierLabels[tier]} Spin</h2><p className="mt-2 text-sm text-slate-400">The server will select one reward using the published odds.</p></div><button type="button" onClick={() => setConfirming(false)} aria-label="Close confirmation" className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/10"><X size={18} /></button></div><div className="mt-6 space-y-3">{tierBonus ? <label className={`flex cursor-pointer gap-3 rounded-[8px] border p-4 ${paymentSource === "bonus_spin" ? "border-[var(--gold)]" : "border-white/10"}`}><input type="radio" name="paymentSource" checked={paymentSource === "bonus_spin"} onChange={() => setPaymentSource("bonus_spin")} /><span><strong>Use Bonus Spin</strong><span className="mt-1 block text-sm text-slate-400">No Reward Points will be deducted.</span></span></label> : null}<label className={`flex cursor-pointer gap-3 rounded-[8px] border p-4 ${paymentSource === "points" ? "border-[var(--gold)]" : "border-white/10"}`}><input type="radio" name="paymentSource" checked={paymentSource === "points"} disabled={points < cost} onChange={() => setPaymentSource("points")} /><span><strong>Use {cost.toLocaleString()} Reward Points</strong><span className="mt-1 block text-sm text-slate-400">Balance after Spin: {Math.max(0, points - cost).toLocaleString()} points.</span></span></label></div>{paymentSource === "points" && points < cost ? <p className="mt-4 flex gap-2 text-sm text-amber-200"><AlertCircle size={17} /> You need {(cost - points).toLocaleString()} more Reward Points.</p> : null}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button><Button onClick={spin} disabled={paymentSource === "points" && points < cost}>Confirm Spin</Button></div></Card></div> : null}
  </AppShell>;
}
