"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { AlertCircle, ArrowLeft, CheckCircle2, Gift, History, RotateCcw, RotateCw, Trophy } from "lucide-react";

const tiers = ["basic", "standard", "premium"] as const;
type RewardTier = (typeof tiers)[number];
type WheelAvailability = "active" | "loading" | "setup_required" | "unavailable" | "locked" | "no_points" | "no_credits" | "no_prizes";

type RewardPrize = {
  id?: string;
  prizeId?: string;
  prizeName?: string;
  prizeDescription?: string;
  prizeType?: string;
  rewardType?: string;
  fulfillmentType?: string;
  manualFulfillmentRequired?: boolean;
  status?: string;
};

type SummaryData = {
  settings?: any;
  prizes?: Record<string, RewardPrize[]>;
  spinCreditsByTier?: Record<string, number>;
  prizeSetupRequired?: boolean;
  availableRewardPoints?: number;
  rewardPoints?: number;
  points?: number;
  balance?: { rewardPoints?: number };
};

type VisualSlice = {
  visualSliceId: string;
  prizeKey: string;
  prize: RewardPrize;
  label: string;
  fullLabel: string;
  color: string;
  textColor: string;
};

const tierConfig: Record<RewardTier, { label: string; threshold: number; cost: number; accent: string }> = {
  basic: {
    label: "Basic",
    threshold: 100,
    cost: 100,
    accent: "#f6c64b",

  },
  standard: {
    label: "Standard",
    threshold: 250,
    cost: 250,
    accent: "#e0b94f",

  },
  premium: {
    label: "Premium",
    threshold: 500,
    cost: 500,
    accent: "#f1d98a",

  }
};

const palette = [
  { color: "#f6c64b", textColor: "#17120a" },
  { color: "#25231f", textColor: "#f8e7b3" },
  { color: "#d2a94b", textColor: "#15100a" },
  { color: "#f0dfad", textColor: "#18120b" },
  { color: "#171717", textColor: "#f6c64b" }
];

const radius = 49;
const center = 50;
const animationMs = 4800;
const reducedAnimationMs = 700;

function rewardPoints(data: SummaryData | null) {
  return Number(data?.availableRewardPoints ?? data?.rewardPoints ?? data?.points ?? data?.balance?.rewardPoints ?? 0);
}

function formatLabel(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").trim();
}

function titleCase(value: unknown) {
  const label = formatLabel(value);
  return label ? label.replace(/\b\w/g, (char) => char.toUpperCase()) : "Unavailable";
}

function prizeKey(prize: RewardPrize) {
  const raw = String(prize.id ?? prize.prizeId ?? prize.rewardType ?? prize.prizeType ?? prize.prizeName ?? "reward").toLowerCase();
  if (raw.includes("no_reward") || raw.includes("no reward") || raw.includes("luck") || raw.includes("try")) return "no-reward";
  if (raw.includes("iphone")) return "iphone-17";
  if (raw.includes("1000") || raw.includes("cash")) return "cash-1000";
  if (raw.includes("500") && raw.includes("coin")) return "dorocoin-500";
  if (raw.includes("1000") && raw.includes("coin")) return "dorocoin-1000";
  if (raw.includes("spin")) return "free-spin";
  if (raw.includes("vote")) return "bonus-vote";
  return raw;
}

function fullPrizeName(prize: RewardPrize, index: number) {
  const name = String(prize.prizeName ?? prize.rewardType ?? prize.prizeType ?? `Reward ${index + 1}`).trim();
  return name.toLowerCase().includes("luck") || name.toLowerCase().includes("try again") ? "No Reward" : name;
}

function shortPrizeName(name: string) {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === "better luck next time") return "No Reward";
  if (trimmed.toLowerCase() === "trip to dubai") return "Dubai Trip";
  if (trimmed.length > 14) return `${trimmed.slice(0, 11)}...`;
  return trimmed;
}

function normalizeVisualPrizes(_tier: RewardTier, configured: RewardPrize[]) {
  return configured.filter((prize) => String(prize.status ?? "active").toLowerCase() !== "disabled").slice(0, 12);
}
function buildVisualSlices(tier: RewardTier, prizes: RewardPrize[]) {
  return normalizeVisualPrizes(tier, prizes).map((prize, index) => {
    const fullLabel = fullPrizeName(prize, index);
    return {
      visualSliceId: `${tier}-${prizeKey(prize)}-${index}`,
      prizeKey: prizeKey(prize),
      prize,
      label: shortPrizeName(fullLabel),
      fullLabel,
      color: palette[index % palette.length].color,
      textColor: palette[index % palette.length].textColor
    } satisfies VisualSlice;
  });
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function resultKey(result: any) {
  return prizeKey({ id: result?.prizeId, prizeId: result?.prize?.id, prizeName: result?.prizeName, rewardType: result?.rewardType, prizeType: result?.prizeType });
}

function selectVisualSliceIndex(slices: VisualSlice[], spinResult: any) {
  const key = resultKey(spinResult);
  const matches = slices.map((slice, index) => ({ slice, index })).filter(({ slice }) => slice.prizeKey === key || slice.fullLabel.toLowerCase() === String(spinResult?.prizeName ?? "").toLowerCase());
  if (!matches.length) return Math.max(0, slices.findIndex((slice) => slice.prizeKey === "no-reward"));
  const reference = String(spinResult?.id ?? spinResult?.spinId ?? spinResult?.prizeId ?? spinResult?.prizeName ?? "result");
  return matches[hashString(reference) % matches.length].index;
}

function polarToCartesian(angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
}

function describeArc(startAngle: number, endAngle: number) {
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [`M ${center} ${center}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function spinCreditLabel(credits: number) {
  return `${credits.toLocaleString()} spin${credits === 1 ? "" : "s"}`;
}

function getAvailability(data: SummaryData | null, tier: RewardTier, prizes: RewardPrize[], credits: number, points: number): { state: WheelAvailability; message: string } {
  const config = tierConfig[tier];
  if (!data) return { state: "loading", message: "Loading rewards." };
  if (data.prizeSetupRequired) return { state: "setup_required", message: "Reward Wheel Setup Required" };
  if (!data.settings?.rewardsEnabled) return { state: "unavailable", message: "Rewards are unavailable." };
  if (data.settings?.maintenanceMode) return { state: "unavailable", message: "Rewards are paused." };
  if (data.settings?.tierEnabled?.[tier] === false) return { state: "locked", message: `${config.label} is unavailable.` };
  if (points < config.threshold) return { state: "locked", message: `You need ${(config.threshold - points).toLocaleString()} more points to unlock this tier.` };
  if (points < config.cost) return { state: "no_points", message: "Not enough points or spins available." };
  if (!prizes.length) return { state: "no_prizes", message: "Reward setup is not available for this tier yet." };
  if (credits <= 0) return { state: "no_credits", message: "Not enough points or spins available." };
  return { state: "active", message: "Ready to spin." };
}

function resultStatusLabel(result: any) {
  const raw = String(result?.fulfillmentStatus ?? result?.rewardStatus ?? result?.status ?? "confirmed").toLowerCase();
  const map: Record<string, string> = {
    credited: "Credited",
    confirmed: "Won",
    available: "Won",
    awaiting_claim: "Pending Claim",
    claim_submitted: "Under Review",
    claim_under_review: "Under Review",
    verification_required: "Verification Required",
    approved: "Approved",
    fulfilled: "Fulfilled",
    rejected: "Rejected",
    expired: "Expired",
    no_reward: "No Reward"
  };
  return map[raw] ?? titleCase(raw);
}

function rewardCategory(prize: RewardPrize) {
  const key = prizeKey(prize);
  if (key === "no-reward") return "No reward";
  if (key.includes("cash")) return "Claim review";
  if (key.includes("iphone") || prize.manualFulfillmentRequired) return "Claim review";
  if (key.includes("spin")) return "Spin credit";
  if (key.includes("vote")) return "Vote boost";
  if (key.includes("coin")) return "DoroCoin";
  return titleCase(prize.rewardType ?? prize.prizeType ?? "Reward");
}

function friendlySpinError(message: string, code?: string) {
  const normalized = String(code || message || "").toUpperCase().replaceAll(" ", "_");
  const map: Record<string, string> = {
    NO_SPIN_CREDITS: "No spins are available for this tier.",
    NO_AVAILABLE_PRIZES: "No prizes are available right now.",
    REWARD_PRIZES_NOT_CONFIGURED: "Reward setup is required.",
    DAILY_LIMIT_REACHED: "Daily spin limit reached.",
    WHEEL_DISABLED: "This wheel is unavailable.",
    REWARDS_DISABLED: "Rewards are unavailable.",
    ACCOUNT_SUSPENDED: "This account is not eligible for rewards.",
    INVALID_REWARD_TIER: "Select an available tier."
  };
  return map[normalized] ?? message ?? "Spin could not be completed.";
}

export default function RewardWheelPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [tier, setTier] = useState<RewardTier>("basic");
  const [message, setMessage] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [requestingSpin, setRequestingSpin] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastResultAnnouncement, setLastResultAnnouncement] = useState("");
  const spinTimeoutRef = useRef<number | null>(null);

  function load() {
    setLoading(true);
    apiRequest<SummaryData>("/api/rewards/summary").then((response) => {
      if (response.ok) {
        setData(response.data ?? null);
        setMessage("");
      } else {
        setMessage(response.message || "Rewards could not load.");
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

  const points = rewardPoints(data);
  const configuredPrizes = useMemo(() => data?.prizes?.[tier] ?? [], [data?.prizes, tier]);
  const visualSlices = useMemo(() => buildVisualSlices(tier, configuredPrizes), [configuredPrizes, tier]);
  const credits = Number(data?.spinCreditsByTier?.[tier] ?? 0);
  const availability = getAvailability(data, tier, configuredPrizes, credits, points);
  const controlsLocked = spinning || requestingSpin;
  const canSpin = !loading && !controlsLocked && availability.state === "active";
  const duration = reducedMotion ? reducedAnimationMs : animationMs;

  async function spin() {
    if (!canSpin) return;
    setRequestingSpin(true);
    setSpinning(false);
    setResult(null);
    setMessage("Confirming spin...");
    setLastResultAnnouncement("");
    const key = crypto.randomUUID();
    const response = await apiRequest<any>("/api/rewards/spin", { method: "POST", body: JSON.stringify({ tier, idempotencyKey: key }) });
    setRequestingSpin(false);
    if (!response.ok) {
      setMessage(friendlySpinError(response.message, response.data?.code));
      return;
    }

    const spinResult = response.data?.spin;
    const targetIndex = selectVisualSliceIndex(visualSlices, spinResult);
    const slice = 360 / Math.max(1, visualSlices.length);
    const turns = reducedMotion ? 1 : 6;
    const finalRotation = turns * 360 - targetIndex * slice - slice / 2;
    setMessage("Result confirmed.");
    setSpinning(true);
    setRotation((current) => current + finalRotation);
    spinTimeoutRef.current = window.setTimeout(() => {
      setResult(spinResult);
      setLastResultAnnouncement(`The wheel landed on ${spinResult?.prizeName ?? "a reward"}.`);
      setSpinning(false);
      setMessage("");
      load();
    }, duration);
  }

  function chooseTier(nextTier: RewardTier) {
    if (controlsLocked) return;
    setTier(nextTier);
    setResult(null);
    setMessage("");
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Reward Wheel" subtitle="Use reward points and available spins to unlock Challenge Suite rewards." icon={<Gift />} />
        <div className="flex flex-col gap-3 sm:flex-row xl:items-center xl:pt-2">
          <Card className="min-h-12 px-4 py-3 text-right"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reward Points</p><p className="text-xl font-black text-[var(--gold)]">{loading ? "..." : points.toLocaleString()}</p></Card>
          <LinkButton href="/rewards" variant="secondary" className="justify-center"><ArrowLeft size={17} /> Rewards</LinkButton>
        </div>
      </div>

      {message ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm font-bold text-yellow-100" role="status">{message}</Card> : null}
      <p className="sr-only" aria-live="polite">{lastResultAnnouncement}</p>

      {loading ? <LoadingWheelState /> : null}
      {!loading && availability.state === "setup_required" ? <WheelUnavailableState /> : null}

      {!loading && availability.state !== "setup_required" ? (
        <div className="mt-8">
          <Card className="overflow-hidden border-white/10 bg-[#10100f] p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite Rewards</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">Choose a tier. Spin when ready.</h2>
              </div>
              <LinkButton href="/rewards/history" variant="secondary" className="justify-center"><History size={17} /> History</LinkButton>
            </div>

            <WheelTierSelector data={data} points={points} tier={tier} disabled={controlsLocked} onSelect={chooseTier} />

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(280px,1fr)_300px] lg:items-center">
              <RewardWheel slices={visualSlices} rotation={rotation} duration={duration} requestingSpin={requestingSpin} spinning={spinning} disabledReason={availability.state === "active" ? "" : availability.message} credits={credits} onSpin={spin} />

              <div className="space-y-4">
                <Card className="border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{tierConfig[tier].label} Tier</p>
                  <h3 className="mt-2 text-3xl font-black" style={{ color: tierConfig[tier].accent }}>{credits.toLocaleString()} Available Spin{credits === 1 ? "" : "s"}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Unlock" value={`${tierConfig[tier].threshold} pts`} />
                    <Stat label="Points per Spin Credit" value={`${tierConfig[tier].cost} pts`} />
                  </div>
                  <p className={`mt-4 rounded-[8px] border p-3 text-sm font-bold ${availability.state === "active" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" : "border-yellow-500/20 bg-yellow-500/5 text-yellow-100"}`}>{availability.message}</p>
                  {reducedMotion ? <p className="mt-3 rounded-[8px] bg-white/[0.04] p-3 text-xs font-bold text-slate-300">Reduced motion enabled.</p> : null}
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={spin} disabled={!canSpin} className="w-full">{requestingSpin ? <><RotateCw className="animate-spin motion-reduce:animate-none" size={18} /> Confirming</> : spinning ? <><RotateCw className="animate-spin motion-reduce:animate-none" size={18} /> Spinning</> : "Spin"}</Button>
                  <Button variant="secondary" onClick={() => { if (!controlsLocked) { setRotation(0); setResult(null); setMessage(""); } }} disabled={controlsLocked}><RotateCcw size={17} /> Reset</Button>
                  <LinkButton href="/rewards/history" variant="secondary" className="col-span-2 w-full"><History size={17} /> History</LinkButton>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {result ? <ResultModal result={result} tier={tier} onClose={() => setResult(null)} onSpinAgain={() => { setResult(null); void spin(); }} canSpinAgain={canSpin} /> : null}
    </AppShell>
  );
}

function WheelTierSelector({ data, points, tier, disabled, onSelect }: { data: SummaryData | null; points: number; tier: RewardTier; disabled: boolean; onSelect: (tier: RewardTier) => void }) {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3" aria-label="Reward wheel tier selector">
      {tiers.map((item) => {
        const credits = Number(data?.spinCreditsByTier?.[item] ?? 0);
        const enabled = data?.settings?.tierEnabled?.[item] !== false;
        const unlocked = points >= tierConfig[item].threshold;
        return (
          <button key={item} type="button" onClick={() => onSelect(item)} disabled={disabled || !enabled} className={`rounded-[8px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/70 ${tier === item ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"} ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{unlocked ? "Unlocked" : "Locked"}</span>
            <span className="mt-2 block text-lg font-black">{tierConfig[item].label}</span>
            <span className="mt-1 block text-sm text-slate-400">{tierConfig[item].threshold} pts unlock / {tierConfig[item].cost} pts per spin credit</span>
            <span className="mt-3 inline-flex rounded-full bg-black/35 px-3 py-1 text-xs font-black text-[var(--gold)]">{spinCreditLabel(credits)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RewardWheel({ slices, rotation, duration, requestingSpin, spinning, disabledReason, credits, onSpin }: { slices: VisualSlice[]; rotation: number; duration: number; requestingSpin: boolean; spinning: boolean; disabledReason: string; credits: number; onSpin: () => void }) {
  const buttonLabel = requestingSpin ? "CONFIRMING" : spinning ? "SPINNING" : disabledReason ? credits <= 0 ? "NO SPINS" : "UNAVAILABLE" : "SPIN";
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="relative mx-auto aspect-square w-full max-w-[min(84vw,540px)]" aria-label="Reward wheel visual">
        <div className="absolute left-1/2 top-[-4px] z-30 -translate-x-1/2 drop-shadow-[0_8px_12px_rgba(0,0,0,.45)]" aria-hidden="true"><div className="h-0 w-0 border-l-[18px] border-r-[18px] border-t-[34px] border-l-transparent border-r-transparent border-t-[var(--gold)]" /></div>
        <div className="absolute inset-x-[14%] bottom-[-7%] h-[18%] rounded-full bg-black/55 blur-2xl" aria-hidden="true" />
        <div className="relative h-full w-full rounded-full border border-white/15 bg-[#080807] p-[5%] shadow-[inset_0_2px_10px_rgba(255,255,255,.08),0_30px_90px_rgba(0,0,0,.58)]">
          <div className="absolute inset-[2.4%] rounded-full border-[12px] border-[#1d1a14] shadow-[inset_0_0_20px_rgba(255,255,255,.07)]" aria-hidden="true" />
          <div className="relative h-full w-full overflow-hidden rounded-full border border-black/80 bg-[#15130f]">
            <svg viewBox="0 0 100 100" className="h-full w-full transition-transform motion-reduce:transition-none" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${duration}ms`, transitionTimingFunction: "cubic-bezier(.12,.78,.11,1)" }} role="img" aria-label="Five visual reward wheel segments.">
              <defs><radialGradient id="wheelLight" cx="35%" cy="28%" r="72%"><stop offset="0%" stopColor="rgba(255,255,255,.34)" /><stop offset="48%" stopColor="rgba(255,255,255,.08)" /><stop offset="100%" stopColor="rgba(0,0,0,.3)" /></radialGradient></defs>
              {slices.map((slice, index) => {
                const start = index * (360 / slices.length);
                const end = (index + 1) * (360 / slices.length);
                const mid = start + (end - start) / 2;
                return <g key={slice.visualSliceId}><path d={describeArc(start, end)} fill={slice.color} stroke="rgba(255,255,255,.38)" strokeWidth="0.28" /><text x="50" y="17" textAnchor="middle" dominantBaseline="middle" fill={slice.textColor} fontSize="4.1" fontWeight="900" transform={`rotate(${mid} 50 50)`}>{slice.label}</text></g>;
              })}
              <circle cx="50" cy="50" r="49" fill="url(#wheelLight)" opacity="0.72" />
              <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="1.2" />
            </svg>
            <button type="button" onClick={onSpin} disabled={Boolean(disabledReason) || spinning || requestingSpin || !slices.length} aria-label={disabledReason ? `Spin unavailable: ${disabledReason}` : "Spin reward wheel"} className="absolute left-1/2 top-1/2 z-20 flex h-[31%] w-[31%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[var(--gold)]/60 bg-[radial-gradient(circle_at_35%_25%,#fff1b7,#f6c64b_38%,#8d641c_100%)] p-3 text-center text-black shadow-[inset_0_2px_10px_rgba(255,255,255,.35),0_13px_28px_rgba(0,0,0,.52)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-75 disabled:hover:scale-100">
              {requestingSpin || spinning ? <RotateCw className="mb-1 animate-spin motion-reduce:animate-none" size={24} /> : <Trophy className="mb-1" size={24} />}
              <span className="text-[11px] font-black tracking-[0.08em] sm:text-sm">{buttonLabel}</span>
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-bold text-slate-300">{requestingSpin ? "Confirming..." : spinning ? "Spinning..." : disabledReason || spinCreditLabel(credits)}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-black/35 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-base font-black text-white">{value}</p></div>;
}

function WheelUnavailableState() {
  return <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-8 text-center"><AlertCircle className="mx-auto text-[var(--gold)]" size={42} /><h2 className="mt-4 text-2xl font-black">Reward Wheel Setup Required</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-yellow-50/80">This reward wheel is not available yet. Please check back later.</p><LinkButton href="/rewards" variant="secondary" className="mt-6">Back to Rewards</LinkButton></Card>;
}

function LoadingWheelState() {
  return <Card className="mt-8 p-6 sm:p-8"><div className="grid gap-8 lg:grid-cols-[minmax(260px,560px)_1fr] lg:items-center"><div className="mx-auto aspect-square w-full max-w-[520px] animate-pulse rounded-full bg-white/[0.06]" /><div className="space-y-4"><div className="h-5 w-36 animate-pulse rounded bg-white/10" /><div className="h-10 w-72 max-w-full animate-pulse rounded bg-white/10" /><div className="h-24 animate-pulse rounded bg-white/10" /></div></div></Card>;
}

function ResultModal({ result, tier, canSpinAgain, onClose, onSpinAgain }: { result: any; tier: RewardTier; canSpinAgain: boolean; onClose: () => void; onSpinAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-labelledby="reward-result-title">
      <Card className="relative max-h-[92vh] w-full max-w-md overflow-y-auto border-[var(--gold)]/40 p-6 text-center sm:p-8">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold)] text-black"><Gift size={34} /></div>
        <p className="relative mt-4 text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">{resultStatusLabel(result)}</p>
        <h2 id="reward-result-title" className="relative mt-3 break-words text-3xl font-black">{result.prizeName ?? "Reward"}</h2>
        <div className="relative mt-5 grid gap-3 text-left sm:grid-cols-2"><Stat label="Tier" value={tierConfig[tier].label} /><Stat label="Reference" value={String(result.id ?? "Recorded").slice(0, 12)} /></div>
        {result.manualFulfillmentRequired ? <p className="relative mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Verification Required</p> : <p className="relative mt-4 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-bold text-emerald-100"><CheckCircle2 className="mr-1 inline" size={16} /> Recorded</p>}
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2"><Button onClick={onSpinAgain} disabled={!canSpinAgain} className="w-full">Spin Again</Button><LinkButton href="/rewards/history" variant="secondary" className="w-full">History</LinkButton><Button onClick={onClose} variant="ghost" className="sm:col-span-2">Close</Button></div>
      </Card>
    </div>
  );
}
