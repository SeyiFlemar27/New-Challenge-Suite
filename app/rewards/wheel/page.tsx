"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Eye, EyeOff, Gift, History, Maximize2, Minimize2, RotateCcw, RotateCw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";

const tiers = ["basic", "standard", "premium"] as const;
type RewardTier = (typeof tiers)[number];
type WheelMode = "standard" | "elimination" | "multi_winner";

const tierCopy: Record<RewardTier, { label: string; eyebrow: string; accent: string }> = {
  basic: { label: "Basic", eyebrow: "Starter rewards", accent: "#f6c64b" },
  standard: { label: "Standard", eyebrow: "Momentum rewards", accent: "#38bdf8" },
  premium: { label: "Premium", eyebrow: "Top-tier rewards", accent: "#a78bfa" }
};

const segmentColors = ["#f6c64b", "#6ee7b7", "#7dd3fc", "#c4b5fd", "#fda4af", "#fdba74", "#93c5fd", "#bef264"];
const animationMs = 4600;

function formatLabel(value: unknown) {
  return String(value ?? "").replaceAll("_", " ");
}

function shortPrizeName(name: string, index: number) {
  const fallback = `Prize ${index + 1}`;
  const cleaned = (name || fallback).trim();
  return cleaned.length > 22 ? `${cleaned.slice(0, 19)}...` : cleaned;
}

function wheelBackground(prizes: any[]) {
  if (!prizes.length) return "radial-gradient(circle at center, #161616 0 54%, #0b0b0b 55% 100%)";
  const segment = 100 / prizes.length;
  return `conic-gradient(${prizes.map((_: any, index: number) => `${segmentColors[index % segmentColors.length]} ${index * segment}% ${(index + 1) * segment}%`).join(", ")})`;
}

function modeDisabledReason(mode: WheelMode) {
  if (mode === "standard") return "";
  if (mode === "elimination") return "Elimination mode will be available after host result confirmation is connected.";
  return "Multi-winner mode requires a configured challenge winner setup.";
}

export default function RewardWheelPage() {
  const [data, setData] = useState<any>(null);
  const [tier, setTier] = useState<RewardTier>("basic");
  const [message, setMessage] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<WheelMode>("standard");
  const [soundOn, setSoundOn] = useState(false);
  const [confettiOn, setConfettiOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const spinTimeoutRef = useRef<number | null>(null);

  function load() {
    setLoading(true);
    apiRequest<any>("/api/rewards/summary").then((response) => {
      if (response.ok) {
        setData(response.data);
        setMessage("");
      } else {
        setMessage(response.message || "Reward wheel data could not load.");
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener?.("change", syncMotion);
    return () => {
      media.removeEventListener?.("change", syncMotion);
      if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const prizes = useMemo(() => data?.prizes?.[tier] ?? [], [data?.prizes, tier]);
  const credits = Number(data?.spinCreditsByTier?.[tier] ?? 0);
  const threshold = Number(data?.settings?.thresholds?.[tier] ?? 0);
  const disabledReason = data?.prizeSetupRequired
    ? "The Spin Wheel is being prepared. Please check back soon."
    : !data?.settings?.rewardsEnabled
      ? "The rewards wheel is not available right now."
      : data?.settings?.maintenanceMode
        ? "Rewards are in maintenance mode."
        : !data?.settings?.tierEnabled?.[tier]
          ? "This wheel is disabled by admin."
          : credits <= 0
            ? `You need ${threshold.toLocaleString()} points to unlock a ${tierCopy[tier].label} spin.`
            : prizes.length === 0
              ? "No prizes are currently available for this wheel."
              : "";
  const canSpin = !disabledReason && !spinning && !loading;
  const selectedModeDisabled = modeDisabledReason(mode);
  const spinDisabledReason = selectedModeDisabled || disabledReason;

  async function spin() {
    if (spinDisabledReason || spinning) return;
    setSpinning(true);
    setResult(null);
    setMessage("");
    const key = crypto.randomUUID();
    const response = await apiRequest<any>("/api/rewards/spin", { method: "POST", body: JSON.stringify({ tier, idempotencyKey: key }) });
    if (!response.ok) {
      setMessage(response.message || "Spin failed. Your credit was not used.");
      setSpinning(false);
      return;
    }
    const spinResult = response.data?.spin;
    const prizeId = spinResult?.prizeId ?? spinResult?.prize?.id;
    const index = Math.max(0, prizes.findIndex((prize: any) => prize.id === prizeId));
    const slice = 360 / Math.max(1, prizes.length);
    const turns = reducedMotion ? 0 : 5;
    const finalRotation = 360 - index * slice - slice / 2;
    setRotation((current) => current + turns * 360 + finalRotation);
    spinTimeoutRef.current = window.setTimeout(() => {
      setResult(spinResult);
      setSpinning(false);
      load();
    }, reducedMotion ? 650 : Number(data?.settings?.animationDurationMs ?? animationMs));
  }

  function resetVisualWheel() {
    if (spinning) return;
    setRotation(0);
    setResult(null);
    setMessage("");
  }

  const shellClass = fullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-[#050505] p-4 sm:p-6" : "";
  const wheelSizeClass = fullscreen ? "max-w-[680px]" : "max-w-[560px]";

  return (
    <AppShell>
      <div className={shellClass}>
        <PageTitle title="Voter Rewards Spin Wheel" subtitle="Choose a tier, use one matching spin credit, and watch the wheel land only after the server confirms your prize." icon={<Gift />} />
        {message ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm font-bold text-yellow-100">{message}</Card> : null}
        {loading ? <LoadingWheelState /> : null}
        {!loading ? (
          <div className={`mt-8 grid gap-6 ${panelOpen ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
            <Card className="overflow-hidden p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Reward wheel</p>
                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">Spin for server-confirmed prizes</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">The browser handles the animation. Prize selection, credit deduction, inventory, and fulfilment stay with the existing server-confirmed rewards flow.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ControlButton active={soundOn} onClick={() => setSoundOn((value) => !value)} label={soundOn ? "Sound on" : "Sound off"} icon={soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />} />
                  <ControlButton active={confettiOn} onClick={() => setConfettiOn((value) => !value)} label={confettiOn ? "Confetti on" : "Confetti off"} icon={<Sparkles size={16} />} />
                  <ControlButton active={panelOpen} onClick={() => setPanelOpen((value) => !value)} label={panelOpen ? "Hide panel" : "Show panel"} icon={panelOpen ? <EyeOff size={16} /> : <Eye size={16} />} />
                  <ControlButton active={fullscreen} onClick={() => setFullscreen((value) => !value)} label={fullscreen ? "Close fullscreen" : "Fullscreen"} icon={fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} />
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {tiers.map((item) => (
                  <button key={item} type="button" onClick={() => setTier(item)} disabled={spinning} className={`rounded-[8px] border p-4 text-left transition ${tier === item ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{tierCopy[item].eyebrow}</p>
                    <p className="mt-2 text-lg font-black">{tierCopy[item].label} Wheel</p>
                    <p className="mt-1 text-sm text-slate-400">{Number(data?.spinCreditsByTier?.[item] ?? 0)} credit{Number(data?.spinCreditsByTier?.[item] ?? 0) === 1 ? "" : "s"}</p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {(["standard", "elimination", "multi_winner"] as WheelMode[]).map((item) => {
                  const reason = modeDisabledReason(item);
                  return (
                    <button key={item} type="button" onClick={() => !reason && setMode(item)} disabled={Boolean(reason) || spinning} title={reason || undefined} className={`rounded-[8px] border px-4 py-3 text-left text-sm font-black capitalize ${mode === item ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]" : "border-white/10 bg-black/20 text-slate-300"} ${reason ? "cursor-not-allowed opacity-55" : "hover:border-white/25"}`}>
                      {formatLabel(item)}
                      {reason ? <span className="mt-1 block text-[11px] font-semibold normal-case leading-4 text-slate-500">Setup required</span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(280px,1fr)_320px] lg:items-center">
                <div className={`relative mx-auto aspect-square w-full ${wheelSizeClass}`}>
                  <div className="absolute left-1/2 top-[-10px] z-20 -translate-x-1/2 drop-shadow-lg" aria-hidden="true">
                    <div className="h-0 w-0 border-l-[16px] border-r-[16px] border-t-[30px] border-l-transparent border-r-transparent border-t-[var(--gold)]" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(246,198,75,.24),transparent_62%)] blur-2xl" />
                  <div className="relative h-full w-full rounded-full border border-white/15 bg-[#080808] p-3 shadow-[0_22px_70px_rgba(0,0,0,.45)] sm:p-4">
                    <div className="relative h-full w-full overflow-hidden rounded-full border-[10px] border-[#111] shadow-inner">
                      <div className="absolute inset-0 rounded-full transition-transform ease-[cubic-bezier(.14,.82,.18,1)] motion-reduce:transition-none" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: reducedMotion ? "220ms" : `${Number(data?.settings?.animationDurationMs ?? animationMs)}ms`, background: wheelBackground(prizes) }}>
                        {prizes.map((prize: any, index: number) => {
                          const angle = (360 / prizes.length) * index + 180 / prizes.length;
                          return (
                            <span key={prize.id ?? index} className="absolute left-1/2 top-1/2 w-[42%] origin-left truncate pr-4 text-[10px] font-black text-[#101010] drop-shadow-sm sm:text-xs" style={{ transform: `rotate(${angle}deg) translateY(-50%)` }}>
                              {shortPrizeName(prize.prizeName, index)}
                            </span>
                          );
                        })}
                      </div>
                      <button type="button" onClick={spin} disabled={Boolean(spinDisabledReason) || spinning} className="absolute left-1/2 top-1/2 z-10 flex h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/20 bg-black/90 p-3 text-center shadow-[0_12px_35px_rgba(0,0,0,.45)] transition hover:border-[var(--gold)]/60 disabled:cursor-not-allowed disabled:opacity-70">
                        {spinning ? <RotateCw className="mb-2 animate-spin text-[var(--gold)] motion-reduce:animate-none" size={24} /> : <Trophy className="mb-2 text-[var(--gold)]" size={24} />}
                        <span className="text-sm font-black sm:text-base">{spinning ? "Spinning" : "Spin"}</span>
                        <span className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:block">CS Rewards</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Selected tier</p>
                    <h3 className="mt-2 text-3xl font-black" style={{ color: tierCopy[tier].accent }}>{tierCopy[tier].label}</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Credits" value={credits.toLocaleString()} />
                      <Stat label="Prizes" value={prizes.length.toLocaleString()} />
                    </div>
                    {spinDisabledReason ? <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm font-bold leading-5 text-yellow-100">{spinDisabledReason}</p> : <p className="mt-4 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-bold text-emerald-100">Ready. Your prize will be confirmed by the server before the result modal appears.</p>}
                    {reducedMotion ? <p className="mt-3 rounded-[8px] bg-white/[0.04] p-3 text-xs font-bold text-slate-300">Reduced motion is enabled. The wheel will use a shorter visual transition.</p> : null}
                  </Card>
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={spin} disabled={!canSpin || Boolean(selectedModeDisabled)} className="w-full">{spinning ? <><RotateCw className="animate-spin motion-reduce:animate-none" size={18} /> Spinning</> : "Spin"}</Button>
                    <Button variant="secondary" onClick={resetVisualWheel} disabled={spinning}><RotateCcw size={17} /> Reset</Button>
                    <LinkButton href="/rewards/history" variant="secondary" className="col-span-2 w-full"><History size={17} /> View Result History</LinkButton>
                  </div>
                </div>
              </div>
            </Card>

            {panelOpen ? <PrizePanel tier={tier} prizes={prizes} credits={credits} setupRequired={Boolean(data?.prizeSetupRequired)} /> : null}
          </div>
        ) : null}

        {result ? <ResultModal result={result} tier={tier} confettiOn={confettiOn} onClose={() => setResult(null)} onSpinAgain={() => { setResult(null); void spin(); }} canSpinAgain={canSpin} /> : null}
      </div>
    </AppShell>
  );
}

function ControlButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <Button type="button" variant={active ? "secondary" : "ghost"} onClick={onClick} className="min-h-10 px-3 text-xs sm:text-sm">{icon}<span>{label}</span></Button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-black/35 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>;
}

function PrizePanel({ tier, prizes, credits, setupRequired }: { tier: RewardTier; prizes: any[]; credits: number; setupRequired: boolean }) {
  return (
    <Card className="h-fit p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Prize panel</p>
          <h2 className="mt-2 text-xl font-black capitalize">{tierCopy[tier].label} rewards</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">{credits} credit{credits === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-5 space-y-3">
        {prizes.length ? prizes.map((prize: any, index: number) => (
          <div key={prize.id ?? index} className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-black" style={{ backgroundColor: segmentColors[index % segmentColors.length] }}>{index + 1}</div>
              <div className="min-w-0">
                <p className="break-words font-black">{prize.prizeName}</p>
                <p className="mt-1 text-xs capitalize text-slate-400">{formatLabel(prize.fulfillmentType)} · {formatLabel(prize.prizeType)}</p>
                {prize.prizeDescription ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">{prize.prizeDescription}</p> : null}
              </div>
            </div>
          </div>
        )) : (
          <Card className="border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-50">
            <p className="font-black">{setupRequired ? "The Spin Wheel is being prepared." : "No active prizes."}</p>
            <p className="mt-2 text-yellow-50/80">{setupRequired ? "Admin prize records are required before the user-facing wheel can award prizes." : "This tier has no configured prizes right now."}</p>
          </Card>
        )}
      </div>
      <Card className="mt-5 border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
        <ShieldCheck size={18} />
        <p className="mt-2 leading-5">Spin credits, prize result, inventory, fulfilment, and history are validated by existing server APIs.</p>
      </Card>
    </Card>
  );
}

function LoadingWheelState() {
  return (
    <Card className="mt-8 p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(260px,520px)_1fr] lg:items-center">
        <div className="mx-auto aspect-square w-full max-w-[520px] animate-pulse rounded-full bg-white/[0.06]" />
        <div className="space-y-4">
          <div className="h-5 w-36 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded bg-white/10" />
          <div className="h-24 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </Card>
  );
}

function ResultModal({ result, tier, confettiOn, canSpinAgain, onClose, onSpinAgain }: { result: any; tier: RewardTier; confettiOn: boolean; canSpinAgain: boolean; onClose: () => void; onSpinAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-labelledby="reward-result-title">
      <Card className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto border-[var(--gold)]/40 p-6 text-center sm:p-8">
        {confettiOn ? <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_20%_20%,rgba(246,198,75,.28),transparent_24%),radial-gradient(circle_at_80%_30%,rgba(56,189,248,.2),transparent_22%)]" /> : null}
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold)] text-black"><Gift size={34} /></div>
        <p className="relative mt-4 text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">Prize confirmed</p>
        <h2 id="reward-result-title" className="relative mt-3 break-words text-3xl font-black">{result.prizeName ?? "Reward recorded"}</h2>
        <p className="relative mt-3 text-sm leading-6 text-slate-300">{result.manualFulfillmentRequired ? "Your prize is pending claim or admin fulfilment review." : "Your digital reward was recorded by the existing server-confirmed reward flow."}</p>
        <div className="relative mt-5 grid gap-3 text-left sm:grid-cols-2">
          <Stat label="Tier" value={tierCopy[tier].label} />
          <Stat label="Status" value={formatLabel(result.fulfillmentStatus ?? result.status ?? "confirmed")} />
        </div>
        <p className="relative mt-4 rounded-[8px] bg-white/[0.04] p-3 text-xs leading-5 text-slate-400">Reference: {result.id ?? "Recorded by server"}</p>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={onSpinAgain} disabled={!canSpinAgain} className="w-full">Spin Again</Button>
          <LinkButton href="/rewards/history" variant="secondary" className="w-full">View History</LinkButton>
          <Button onClick={onClose} variant="ghost" className="sm:col-span-2">Close</Button>
        </div>
      </Card>
    </div>
  );
}

