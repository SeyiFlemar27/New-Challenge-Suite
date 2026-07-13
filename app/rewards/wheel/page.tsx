"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Gift, History, Maximize2, Minimize2, RotateCcw, RotateCw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";

const tiers = ["basic", "standard", "premium"] as const;
type RewardTier = (typeof tiers)[number];
type WheelMode = "standard" | "elimination" | "multi_winner";
type WheelAvailability = "active" | "setup_required" | "unavailable" | "maintenance" | "tier_locked" | "no_credits" | "no_prizes";

type RewardPrize = {
  id?: string;
  prizeId?: string;
  prizeName?: string;
  prizeDescription?: string;
  prizeType?: string;
  rewardType?: string;
  prizeTier?: string;
  fulfillmentType?: string;
  manualFulfillmentRequired?: boolean;
  imageUrl?: string;
  status?: string;
  rewardValue?: number | string;
};

type VisualSlice = {
  visualSliceId: string;
  prizeKey: string;
  prize: RewardPrize;
  label: string;
  fullLabel: string;
  color: string;
  textColor: string;
  icon: string;
};

type SummaryData = {
  settings?: any;
  prizes?: Record<string, RewardPrize[]>;
  spinCreditsByTier?: Record<string, number>;
  tiers?: any[];
  recentRewards?: any[];
  history?: any[];
  prizeSetupRequired?: boolean;
  safety?: any;
};

const tierCopy: Record<RewardTier, { label: string; eyebrow: string; description: string; accent: string }> = {
  basic: { label: "Basic Wheel", eyebrow: "Starter rewards", description: "Entry-level reward spins", accent: "#f6c64b" },
  standard: { label: "Standard Wheel", eyebrow: "Momentum rewards", description: "Unlocked through higher reward activity", accent: "#d9a93a" },
  premium: { label: "Premium Wheel", eyebrow: "Premium rewards", description: "Top-tier configured rewards", accent: "#f1d98a" }
};

const visualPalette = [
  { color: "#f6c64b", textColor: "#17120a" },
  { color: "#2a2924", textColor: "#f8e7b3" },
  { color: "#d8b45a", textColor: "#15100a" },
  { color: "#f3e7c2", textColor: "#18120b" },
  { color: "#403a2a", textColor: "#f7e7b6" },
  { color: "#b88736", textColor: "#130f09" },
  { color: "#191817", textColor: "#f6c64b" },
  { color: "#e0c16e", textColor: "#17120a" },
  { color: "#74603b", textColor: "#fff6dc" },
  { color: "#f7d56d", textColor: "#18120b" },
  { color: "#302d28", textColor: "#f8e7b3" },
  { color: "#c9953f", textColor: "#15100a" }
];

const animationMs = 5600;
const reducedAnimationMs = 900;
const visualSliceCount = 12;
const radius = 49;
const center = 50;

function formatLabel(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").trim();
}

function titleCase(value: unknown) {
  const label = formatLabel(value);
  return label ? label.replace(/\b\w/g, (char) => char.toUpperCase()) : "Not available yet";
}

function prizeKey(prize: RewardPrize) {
  return String(prize.id ?? prize.prizeId ?? prize.rewardType ?? prize.prizeType ?? prize.prizeName ?? "reward").toLowerCase();
}

function rewardCategory(prize: RewardPrize) {
  const type = String(prize.prizeType ?? prize.rewardType ?? "reward").toLowerCase();
  if (type.includes("cash")) return "Cash reward";
  if (type.includes("coin") || String(prize.prizeName ?? "").toLowerCase().includes("dorocoin")) return "DoroCoin";
  if (type.includes("spin")) return "Spin credit";
  if (type.includes("vote")) return "Vote boost";
  if (type.includes("try") || String(prize.prizeName ?? "").toLowerCase().includes("luck")) return "No reward";
  if (prize.manualFulfillmentRequired) return "Claim review";
  return titleCase(type);
}

function fullPrizeName(prize: RewardPrize, index: number) {
  return String(prize.prizeName ?? prize.rewardType ?? prize.prizeType ?? `Reward ${index + 1}`).trim();
}

function shortPrizeName(name: string) {
  const cleaned = name.trim();
  const replacements: Record<string, string> = {
    "trip to dubai": "Dubai Trip",
    "better luck next time": "Try Again",
    "bonus vote pack": "Bonus Votes"
  };
  const mapped = replacements[cleaned.toLowerCase()] ?? cleaned;
  return mapped.length > 16 ? `${mapped.slice(0, 13)}...` : mapped;
}

function prizeIcon(prize: RewardPrize) {
  const name = String(prize.prizeName ?? prize.prizeType ?? "").toLowerCase();
  if (name.includes("iphone") || name.includes("phone")) return "PH";
  if (name.includes("dubai") || name.includes("trip") || name.includes("travel")) return "TR";
  if (name.includes("cash") || name.includes("$")) return "$";
  if (name.includes("dorocoin") || name.includes("coin")) return "DC";
  if (name.includes("spin")) return "SP";
  if (name.includes("vote")) return "VT";
  if (name.includes("luck") || name.includes("try")) return "--";
  return "CS";
}

function buildVisualSlices(prizes: RewardPrize[]) {
  if (!prizes.length) return [];
  return Array.from({ length: visualSliceCount }, (_, index) => {
    const prize = prizes[index % prizes.length];
    const palette = visualPalette[index % visualPalette.length];
    const fullLabel = fullPrizeName(prize, index);
    return {
      visualSliceId: `${prizeKey(prize)}-${index}`,
      prizeKey: prizeKey(prize),
      prize,
      label: shortPrizeName(fullLabel),
      fullLabel,
      color: palette.color,
      textColor: palette.textColor,
      icon: prizeIcon(prize)
    } satisfies VisualSlice;
  });
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function selectVisualSliceIndex(slices: VisualSlice[], spinResult: any) {
  const resultKey = String(spinResult?.prizeId ?? spinResult?.prize?.id ?? spinResult?.rewardType ?? spinResult?.prizeType ?? spinResult?.prizeName ?? "").toLowerCase();
  const matches = slices.map((slice, index) => ({ slice, index })).filter(({ slice }) => slice.prizeKey === resultKey || String(slice.fullLabel).toLowerCase() === resultKey);
  if (!matches.length) return Math.max(0, slices.findIndex((slice) => String(slice.fullLabel).toLowerCase() === String(spinResult?.prizeName ?? "").toLowerCase()));
  const reference = String(spinResult?.id ?? spinResult?.spinId ?? spinResult?.prizeId ?? spinResult?.prizeName ?? "result");
  return matches[hashString(reference) % matches.length].index;
}

function polarToCartesian(angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians)
  };
}

function describeArc(startAngle: number, endAngle: number) {
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [`M ${center} ${center}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function modeDisabledReason(mode: WheelMode) {
  if (mode === "standard") return "";
  if (mode === "elimination") return "Elimination mode will be available after host result confirmation is connected.";
  return "Multi-winner mode requires a configured challenge winner setup.";
}

function spinCreditLabel(credits: number) {
  return `${credits.toLocaleString()} spin${credits === 1 ? "" : "s"} remaining`;
}

function getAvailability(data: SummaryData | null, tier: RewardTier, prizes: RewardPrize[], credits: number): { state: WheelAvailability; message: string } {
  if (!data) return { state: "unavailable", message: "Reward wheel data could not load." };
  if (data.prizeSetupRequired) return { state: "setup_required", message: "This reward wheel is not available yet. Please check back later." };
  if (!data.settings?.rewardsEnabled) return { state: "unavailable", message: "The reward wheel is not available right now." };
  if (data.settings?.maintenanceMode) return { state: "maintenance", message: "Rewards are temporarily unavailable while maintenance is in progress." };
  if (!data.settings?.tierEnabled?.[tier]) return { state: "tier_locked", message: `${tierCopy[tier].label} is not available right now.` };
  if (!prizes.length) return { state: "no_prizes", message: "This wheel does not have configured prizes yet." };
  if (credits <= 0) return { state: "no_credits", message: `You do not have any ${tierCopy[tier].label} spins available.` };
  return { state: "active", message: "Ready to spin. The reward result is confirmed by Challenge Suite before the wheel moves." };
}

function resultStatusLabel(result: any) {
  const raw = String(result?.fulfillmentStatus ?? result?.rewardStatus ?? result?.status ?? "confirmed").toLowerCase();
  const map: Record<string, string> = {
    credited: "Credited",
    confirmed: "Available",
    awaiting_claim: "Pending claim",
    claim_submitted: "Under review",
    claim_under_review: "Under review",
    verification_required: "Verification required",
    approved: "Approved",
    fulfilled: "Fulfilled",
    rejected: "Rejected",
    expired: "Expired",
    no_reward: "Recorded"
  };
  return map[raw] ?? titleCase(raw);
}

function resultMessage(result: any) {
  const name = String(result?.prizeName ?? "").toLowerCase();
  const status = String(result?.fulfillmentStatus ?? result?.rewardStatus ?? result?.status ?? "").toLowerCase();
  if (status === "no_reward" || name.includes("luck") || name.includes("try again")) return "This spin did not include a reward. You can return when you earn another spin credit.";
  if (result?.manualFulfillmentRequired) return "Your reward has been recorded and is pending claim review. Identity verification may be required before approval.";
  if (status === "credited") return "This digital reward was confirmed by the server and recorded to your rewards account.";
  if (name.includes("free spin")) return "This reward has been recorded and is awaiting credit processing.";
  return "This reward was confirmed by the Challenge Suite reward system.";
}

function isMeaningfulReward(result: any) {
  const status = String(result?.fulfillmentStatus ?? result?.rewardStatus ?? "").toLowerCase();
  const name = String(result?.prizeName ?? "").toLowerCase();
  return status !== "no_reward" && !name.includes("luck") && !name.includes("try again");
}

function friendlySpinError(message: string, code?: string) {
  const normalized = String(code || message || "").toUpperCase().replaceAll(" ", "_");
  const map: Record<string, string> = {
    NO_SPIN_CREDITS: "No spin credits are available for this wheel.",
    NO_AVAILABLE_PRIZES: "No active prizes are available for this wheel right now.",
    REWARD_PRIZES_NOT_CONFIGURED: "Reward Wheel setup is required before spins can award prizes.",
    DAILY_LIMIT_REACHED: "You have reached today's spin limit.",
    WHEEL_DISABLED: "This wheel is temporarily unavailable.",
    REWARDS_DISABLED: "Rewards are not available right now.",
    CAMPAIGN_NOT_STARTED: "This reward campaign has not started yet.",
    CAMPAIGN_ENDED: "This reward campaign has ended.",
    ACCOUNT_SUSPENDED: "This account is not eligible for rewards.",
    INVALID_REWARD_TIER: "Select an available reward wheel tier."
  };
  return map[normalized] ?? message ?? "Reward spin could not be recorded. Your spin credit was not used.";
}

export default function RewardWheelPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [tier, setTier] = useState<RewardTier>("basic");
  const [message, setMessage] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [requestingSpin, setRequestingSpin] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<WheelMode>("standard");
  const [soundOn, setSoundOn] = useState(false);
  const [celebrationOn, setCelebrationOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
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
  const visualSlices = useMemo(() => buildVisualSlices(prizes), [prizes]);
  const credits = Number(data?.spinCreditsByTier?.[tier] ?? 0);
  const recentResults = useMemo(() => (data?.recentRewards ?? data?.history ?? []).slice(0, 3), [data?.history, data?.recentRewards]);
  const availability = getAvailability(data, tier, prizes, credits);
  const selectedModeDisabled = modeDisabledReason(mode);
  const spinDisabledReason = selectedModeDisabled || (availability.state === "active" ? "" : availability.message);
  const controlsLocked = spinning || requestingSpin;
  const canSpin = !spinDisabledReason && !controlsLocked && !loading;
  const duration = reducedMotion ? reducedAnimationMs : Number(data?.settings?.animationDurationMs ?? animationMs);

  async function spin() {
    if (!canSpin) return;
    setRequestingSpin(true);
    setSpinning(false);
    setResult(null);
    setMessage("Confirming your spin with Challenge Suite...");
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
    const safeTargetIndex = targetIndex >= 0 ? targetIndex : 0;
    const slice = 360 / Math.max(1, visualSlices.length || visualSliceCount);
    const turns = reducedMotion ? 1 : 7;
    const finalRotation = turns * 360 - safeTargetIndex * slice - slice / 2;
    setMessage("Server-confirmed result received. Animating the wheel now.");
    setSpinning(true);
    setRotation((current) => current + finalRotation);
    spinTimeoutRef.current = window.setTimeout(() => {
      setResult(spinResult);
      setLastResultAnnouncement(`The wheel landed on ${spinResult?.prizeName ?? "a confirmed reward"}.`);
      setSpinning(false);
      setMessage("");
      load();
    }, duration);
  }

  function resetVisualWheel() {
    if (controlsLocked) return;
    setRotation(0);
    setResult(null);
    setMessage("");
    setLastResultAnnouncement("");
  }

  function chooseTier(nextTier: RewardTier) {
    if (controlsLocked) return;
    setTier(nextTier);
    setResult(null);
    setMessage("");
  }

  const shellClass = fullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-[#050505] p-4 sm:p-6" : "";

  return (
    <AppShell>
      <div className={shellClass}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <PageTitle title="Reward Wheel" subtitle="Use your available spin credits to unlock Challenge Suite rewards." icon={<Gift />} />
          <LinkButton href="/rewards" variant="secondary" className="w-full justify-center sm:w-auto"><ArrowLeft size={17} /> Back to Rewards</LinkButton>
        </div>

        {message ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm font-bold text-yellow-100" role="status">{message}</Card> : null}
        <p className="sr-only" aria-live="polite">{lastResultAnnouncement}</p>
        {loading ? <LoadingWheelState /> : null}

        {!loading && availability.state === "setup_required" ? <WheelUnavailableState /> : null}

        {!loading && availability.state !== "setup_required" ? (
          <div className={`mt-8 grid gap-6 ${panelOpen ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""}`}>
            <Card className="overflow-hidden border-white/10 bg-[#10100f] p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite rewards</p>
                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">Spin after the reward system confirms your result.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">The wheel is visual only. Prize selection, credits, inventory, fulfilment, and history remain controlled by the existing reward system.</p>
                </div>
                <SpinControls soundOn={soundOn} celebrationOn={celebrationOn} panelOpen={panelOpen} fullscreen={fullscreen} disabled={controlsLocked} onSound={() => setSoundOn((value) => !value)} onCelebration={() => setCelebrationOn((value) => !value)} onPanel={() => setPanelOpen((value) => !value)} onFullscreen={() => setFullscreen((value) => !value)} />
              </div>

              <WheelTierSelector data={data} tier={tier} disabled={controlsLocked} onSelect={chooseTier} />

              <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Wheel mode options">
                {(["standard", "elimination", "multi_winner"] as WheelMode[]).map((item) => {
                  const reason = modeDisabledReason(item);
                  return (
                    <button key={item} type="button" onClick={() => !reason && setMode(item)} disabled={Boolean(reason) || controlsLocked} title={reason || undefined} className={`rounded-[8px] border px-4 py-3 text-left text-sm font-black capitalize transition ${mode === item ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]" : "border-white/10 bg-black/20 text-slate-300"} ${reason ? "cursor-not-allowed opacity-60" : "hover:border-white/25"}`}>
                      {formatLabel(item)}
                      {reason ? <span className="mt-1 block text-[11px] font-semibold normal-case leading-4 text-slate-500">Setup required</span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(280px,1fr)_320px] lg:items-center">
                <RewardWheel slices={visualSlices} rotation={rotation} duration={duration} reducedMotion={reducedMotion} requestingSpin={requestingSpin} spinning={spinning} disabledReason={spinDisabledReason} credits={credits} onSpin={spin} />

                <div className="space-y-4">
                  <Card className="border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Selected tier</p>
                    <h3 className="mt-2 text-3xl font-black" style={{ color: tierCopy[tier].accent }}>{tierCopy[tier].label}</h3>
                    <p className="mt-2 text-sm text-slate-400">{tierCopy[tier].description}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Balance" value={spinCreditLabel(credits)} />
                      <Stat label="Visual slices" value={`${visualSlices.length || visualSliceCount}`} />
                    </div>
                    <p className={`mt-4 rounded-[8px] border p-3 text-sm font-bold leading-5 ${availability.state === "active" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" : "border-yellow-500/20 bg-yellow-500/5 text-yellow-100"}`}>{spinDisabledReason || availability.message}</p>
                    {reducedMotion ? <p className="mt-3 rounded-[8px] bg-white/[0.04] p-3 text-xs font-bold text-slate-300">Reduced motion is enabled. The wheel uses a shorter transition and still shows the confirmed result.</p> : null}
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={spin} disabled={!canSpin} className="w-full">{requestingSpin ? <><RotateCw className="animate-spin motion-reduce:animate-none" size={18} /> Confirming</> : spinning ? <><RotateCw className="animate-spin motion-reduce:animate-none" size={18} /> Spinning</> : "Spin"}</Button>
                    <Button variant="secondary" onClick={resetVisualWheel} disabled={controlsLocked}><RotateCcw size={17} /> Reset</Button>
                    <LinkButton href="/rewards/history" variant="secondary" className="col-span-2 w-full"><History size={17} /> View Reward History</LinkButton>
                  </div>
                </div>
              </div>
            </Card>

            {panelOpen ? <PrizeLegend tier={tier} prizes={prizes} slices={visualSlices} credits={credits} recentResults={recentResults} setupRequired={Boolean(data?.prizeSetupRequired)} /> : null}
          </div>
        ) : null}

        {result ? <ResultModal result={result} tier={tier} celebrationOn={celebrationOn && isMeaningfulReward(result)} onClose={() => setResult(null)} onSpinAgain={() => { setResult(null); void spin(); }} canSpinAgain={canSpin} /> : null}
      </div>
    </AppShell>
  );
}

function WheelTierSelector({ data, tier, disabled, onSelect }: { data: SummaryData | null; tier: RewardTier; disabled: boolean; onSelect: (tier: RewardTier) => void }) {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3" aria-label="Reward wheel tier selector">
      {tiers.map((item) => {
        const credits = Number(data?.spinCreditsByTier?.[item] ?? 0);
        const enabled = data?.settings?.tierEnabled?.[item] !== false;
        return (
          <button key={item} type="button" onClick={() => onSelect(item)} disabled={disabled || !enabled} className={`rounded-[8px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/70 ${tier === item ? "border-[var(--gold)] bg-[var(--gold)]/10 shadow-[0_0_28px_rgba(246,198,75,.10)]" : "border-white/10 bg-white/[0.03] hover:border-white/25"} ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{tierCopy[item].eyebrow}</span>
            <span className="mt-2 block text-lg font-black">{tierCopy[item].label}</span>
            <span className="mt-1 block text-sm text-slate-400">{enabled ? spinCreditLabel(credits) : "Currently unavailable"}</span>
          </button>
        );
      })}
    </div>
  );
}

function RewardWheel({ slices, rotation, duration, reducedMotion, requestingSpin, spinning, disabledReason, credits, onSpin }: { slices: VisualSlice[]; rotation: number; duration: number; reducedMotion: boolean; requestingSpin: boolean; spinning: boolean; disabledReason: string; credits: number; onSpin: () => void }) {
  const wheelReady = slices.length > 0;
  const buttonLabel = requestingSpin ? "CONFIRMING" : spinning ? "SPINNING..." : disabledReason ? credits <= 0 ? "NO SPINS" : "UNAVAILABLE" : "SPIN";
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="relative mx-auto aspect-square w-full max-w-[min(86vw,620px)]" aria-label="Reward wheel visual">
        <div className="absolute left-1/2 top-[-4px] z-30 -translate-x-1/2 drop-shadow-[0_8px_12px_rgba(0,0,0,.45)]" aria-hidden="true">
          <div className="h-0 w-0 border-l-[18px] border-r-[18px] border-t-[34px] border-l-transparent border-r-transparent border-t-[var(--gold)]" />
          <div className="mx-auto -mt-1 h-3 w-3 rounded-full bg-[#f8e7b3]" />
        </div>
        <div className="absolute inset-x-[14%] bottom-[-7%] h-[18%] rounded-full bg-black/55 blur-2xl" aria-hidden="true" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_36%_24%,rgba(255,243,196,.24),transparent_27%),radial-gradient(circle_at_50%_50%,rgba(246,198,75,.18),transparent_62%)] blur-xl" aria-hidden="true" />
        <div className="relative h-full w-full rounded-full border border-white/15 bg-[#080807] p-[4.5%] shadow-[inset_0_2px_10px_rgba(255,255,255,.08),0_30px_90px_rgba(0,0,0,.58)]">
          <div className="absolute inset-[2.2%] rounded-full border-[14px] border-[#1c1913] shadow-[inset_0_0_20px_rgba(255,255,255,.07)]" aria-hidden="true" />
          <div className="relative h-full w-full overflow-hidden rounded-full border border-black/80 bg-[#15130f]">
            {wheelReady ? (
              <svg viewBox="0 0 100 100" className="h-full w-full transition-transform motion-reduce:transition-none" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${duration}ms`, transitionTimingFunction: "cubic-bezier(.12,.78,.11,1)" }} role="img" aria-label="Visual wheel slices. Confirmed reward appears as text after spinning.">
                <defs>
                  <radialGradient id="wheelLight" cx="35%" cy="28%" r="72%">
                    <stop offset="0%" stopColor="rgba(255,255,255,.38)" />
                    <stop offset="45%" stopColor="rgba(255,255,255,.08)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,.28)" />
                  </radialGradient>
                </defs>
                {slices.map((slice, index) => {
                  const start = index * (360 / slices.length);
                  const end = (index + 1) * (360 / slices.length);
                  const mid = start + (end - start) / 2;
                  return (
                    <g key={slice.visualSliceId}>
                      <path d={describeArc(start, end)} fill={slice.color} stroke="rgba(255,255,255,.35)" strokeWidth="0.22" />
                      <text x="50" y="14" textAnchor="middle" dominantBaseline="middle" fill={slice.textColor} fontSize="3.2" fontWeight="900" transform={`rotate(${mid} 50 50)`}>{slice.label}</text>
                      <text x="50" y="20" textAnchor="middle" dominantBaseline="middle" fill={slice.textColor} fontSize="2.4" fontWeight="800" opacity="0.74" transform={`rotate(${mid} 50 50)`}>{slice.icon}</text>
                    </g>
                  );
                })}
                <circle cx="50" cy="50" r="49" fill="url(#wheelLight)" opacity="0.75" />
                <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="1.2" />
              </svg>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,#242018,#111)] p-8 text-center text-sm font-bold text-slate-300">Reward Wheel setup required</div>
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(130deg,rgba(255,255,255,.22),transparent_26%,transparent_68%,rgba(0,0,0,.28))]" aria-hidden="true" />
            <button type="button" onClick={onSpin} disabled={Boolean(disabledReason) || spinning || requestingSpin || !wheelReady} aria-label={disabledReason ? `Spin unavailable: ${disabledReason}` : "Spin reward wheel"} className="absolute left-1/2 top-1/2 z-20 flex h-[31%] w-[31%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[var(--gold)]/60 bg-[radial-gradient(circle_at_35%_25%,#fff1b7,#f6c64b_36%,#8d641c_100%)] p-3 text-center text-black shadow-[inset_0_2px_10px_rgba(255,255,255,.35),0_13px_28px_rgba(0,0,0,.52)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-75 disabled:hover:scale-100">
              {requestingSpin || spinning ? <RotateCw className="mb-1 animate-spin motion-reduce:animate-none" size={24} /> : <Trophy className="mb-1" size={24} />}
              <span className="text-[11px] font-black tracking-[0.08em] sm:text-sm">{buttonLabel}</span>
              <span className="mt-1 hidden text-[9px] font-black uppercase tracking-[0.16em] opacity-70 sm:block">CS Rewards</span>
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-bold text-slate-300">{requestingSpin ? "Confirming reward outcome..." : spinning ? "Wheel in motion..." : disabledReason || spinCreditLabel(credits)}</p>
      {reducedMotion ? <p className="mt-2 text-center text-xs font-semibold text-slate-500">Reduced motion is respected for this animation.</p> : null}
    </div>
  );
}

function SpinControls({ soundOn, celebrationOn, panelOpen, fullscreen, disabled, onSound, onCelebration, onPanel, onFullscreen }: { soundOn: boolean; celebrationOn: boolean; panelOpen: boolean; fullscreen: boolean; disabled: boolean; onSound: () => void; onCelebration: () => void; onPanel: () => void; onFullscreen: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton active={soundOn} disabled={disabled} onClick={onSound} label={soundOn ? "Sound on" : "Sound off"} icon={soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />} />
      <ControlButton active={celebrationOn} disabled={disabled} onClick={onCelebration} label={celebrationOn ? "Effects on" : "Effects off"} icon={<Sparkles size={16} />} />
      <ControlButton active={panelOpen} disabled={false} onClick={onPanel} label={panelOpen ? "Hide panel" : "Show panel"} icon={panelOpen ? <EyeOff size={16} /> : <Eye size={16} />} />
      <ControlButton active={fullscreen} disabled={false} onClick={onFullscreen} label={fullscreen ? "Close fullscreen" : "Fullscreen"} icon={fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} />
    </div>
  );
}

function ControlButton({ active, disabled, icon, label, onClick }: { active: boolean; disabled?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <Button type="button" variant={active ? "secondary" : "ghost"} disabled={disabled} onClick={onClick} className="min-h-10 px-3 text-xs sm:text-sm">{icon}<span>{label}</span></Button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-black/35 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-base font-black text-white">{value}</p></div>;
}

function PrizeLegend({ tier, prizes, slices, credits, recentResults, setupRequired }: { tier: RewardTier; prizes: RewardPrize[]; slices: VisualSlice[]; credits: number; recentResults: any[]; setupRequired: boolean }) {
  const uniquePrizes = prizes.slice(0, 12);
  return (
    <Card className="h-fit p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Prize legend</p>
          <h2 className="mt-2 text-xl font-black">{tierCopy[tier].label}</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">{spinCreditLabel(credits)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">Displayed slices are visual representations. Reward outcomes are determined securely by the Challenge Suite reward system.</p>
      <div className="mt-5 space-y-3">
        {uniquePrizes.length ? uniquePrizes.map((prize, index) => {
          const slice = slices.find((item) => item.prizeKey === prizeKey(prize));
          return (
            <div key={prizeKey(prize) + index} className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: slice?.color ?? "#f6c64b", color: slice?.textColor ?? "#111" }}>{prizeIcon(prize)}</div>
                <div className="min-w-0">
                  <p className="break-words font-black">{fullPrizeName(prize, index)}</p>
                  <p className="mt-1 text-xs text-slate-400">{rewardCategory(prize)} · {prize.manualFulfillmentRequired ? "Claim review" : titleCase(prize.fulfillmentType ?? "Automatic digital")}</p>
                  {prize.prizeDescription ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">{prize.prizeDescription}</p> : null}
                </div>
              </div>
            </div>
          );
        }) : (
          <Card className="border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-50">
            <p className="font-black">{setupRequired ? "Reward Wheel Setup Required" : "No active prizes"}</p>
            <p className="mt-2 text-yellow-50/80">{setupRequired ? "This reward wheel is not available yet. Please check back later." : "This tier does not have configured prizes right now."}</p>
          </Card>
        )}
      </div>
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Recent results</h3>
          <LinkButton href="/rewards/history" variant="ghost" className="min-h-9 px-3 py-2 text-xs">History</LinkButton>
        </div>
        {recentResults.length ? <div className="mt-3 space-y-2">{recentResults.map((item: any) => <div key={item.id} className="rounded-[8px] bg-black/30 p-3"><p className="text-sm font-black">{item.prizeName ?? "Reward"}</p><p className="mt-1 text-xs text-slate-500">{titleCase(item.wheelTier ?? tier)} · {resultStatusLabel(item)}</p></div>)}</div> : <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-sm text-slate-400">Recent spin results will appear here after the server confirms them.</p>}
      </div>
      <Card className="mt-5 border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
        <ShieldCheck size={18} />
        <p className="mt-2 leading-5">KYC is not required to spin. Verification may be required later for cash, travel, physical, or high-value reward claims.</p>
      </Card>
    </Card>
  );
}

function WheelUnavailableState() {
  return (
    <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-8 text-center">
      <AlertCircle className="mx-auto text-[var(--gold)]" size={42} />
      <h2 className="mt-4 text-2xl font-black">Reward Wheel Setup Required</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-yellow-50/80">This reward wheel is not available yet. Please check back later.</p>
      <LinkButton href="/rewards" variant="secondary" className="mt-6">Back to Rewards</LinkButton>
    </Card>
  );
}

function LoadingWheelState() {
  return (
    <Card className="mt-8 p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(260px,560px)_1fr] lg:items-center">
        <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse rounded-full bg-white/[0.06]" />
        <div className="space-y-4">
          <div className="h-5 w-36 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded bg-white/10" />
          <div className="h-24 animate-pulse rounded bg-white/10" />
          <div className="h-24 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </Card>
  );
}

function ResultModal({ result, tier, celebrationOn, canSpinAgain, onClose, onSpinAgain }: { result: any; tier: RewardTier; celebrationOn: boolean; canSpinAgain: boolean; onClose: () => void; onSpinAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-labelledby="reward-result-title">
      <Card className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto border-[var(--gold)]/40 p-6 text-center sm:p-8">
        {celebrationOn ? <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_18%_25%,rgba(246,198,75,.28),transparent_22%),radial-gradient(circle_at_78%_25%,rgba(255,255,255,.16),transparent_20%)]" /> : null}
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold)] text-black shadow-[0_14px_36px_rgba(246,198,75,.22)]"><Gift size={34} /></div>
        <p className="relative mt-4 text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">Server-confirmed result</p>
        <h2 id="reward-result-title" className="relative mt-3 break-words text-3xl font-black">{result.prizeName ?? "Reward recorded"}</h2>
        <p className="relative mt-3 text-sm leading-6 text-slate-300">{resultMessage(result)}</p>
        <div className="relative mt-5 grid gap-3 text-left sm:grid-cols-2">
          <Stat label="Tier" value={tierCopy[tier].label} />
          <Stat label="Status" value={resultStatusLabel(result)} />
        </div>
        {result.manualFulfillmentRequired ? <p className="relative mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm font-bold leading-5 text-yellow-100">Verification may be required before claim approval. Use Reward History to continue when the claim flow is available.</p> : <p className="relative mt-4 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-bold leading-5 text-emerald-100"><CheckCircle2 className="mr-1 inline" size={16} /> Reward outcome recorded by the existing server flow.</p>}
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
