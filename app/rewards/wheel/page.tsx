"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift, History, Sparkles, Trophy } from "lucide-react";

type Tier = { id: string; label: string; pointsRequired: number; spinCredits: number; spinTier: "basic" | "standard" | "premium" };
type Prize = { id: string; prizeName: string; prizeDescription?: string; prizeTier: "basic" | "standard" | "premium"; prizeType: string; probabilityWeight: number; manualFulfillmentRequired: boolean };
type SpinResult = { id: string; wheelTier: string; prize?: Prize; status?: string };

const tierTone: Record<string, string> = {
  basic: "from-yellow-500/20 to-white/5",
  standard: "from-emerald-500/20 to-white/5",
  premium: "from-fuchsia-500/20 to-white/5"
};

export default function RewardsWheelPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [selectedTier, setSelectedTier] = useState<"basic" | "standard" | "premium">("basic");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);

  async function load() {
    const result = await apiRequest("/api/rewards");
    if (result.ok) setData(result.data);
    else setMessage(result.message);
  }

  useEffect(() => { void load(); }, []);

  const credits = data?.spinCreditsByTier ?? { basic: 0, standard: 0, premium: 0 };
  const points = Number(data?.points ?? 0);
  const tiers: Tier[] = data?.tiers ?? [];
  const prizes: Prize[] = data?.prizes ?? [];
  const selectedPrizes = useMemo(() => prizes.filter((prize) => prize.prizeTier === selectedTier), [prizes, selectedTier]);
  const wheelPrizes = selectedPrizes.length ? selectedPrizes : [];
  const nextTier = useMemo(() => tiers.find((tier) => points < Number(tier.pointsRequired)), [tiers, points]);
  const pointsToNext = nextTier ? Math.max(0, Number(nextTier.pointsRequired) - points) : 0;

  async function spin() {
    if (Number(credits[selectedTier] ?? 0) <= 0) {
      setMessage(`You need ${selectedTier} spin credits before spinning this wheel.`);
      return;
    }
    setSpinning(true);
    setMessage("");
    setResult(null);
    const idempotencyKey = crypto.randomUUID();
    const response = await apiRequest<{ spin?: SpinResult }>("/api/rewards", { method: "POST", body: JSON.stringify({ action: "spin", tier: selectedTier, idempotencyKey }) });
    if (!response.ok || !response.data?.spin) {
      setSpinning(false);
      setMessage(response.message || "Something went wrong. Your spin credit was not used. Please try again.");
      return;
    }
    const spinResult = response.data.spin;
    const prizeIndex = Math.max(0, wheelPrizes.findIndex((prize) => prize.id === spinResult.prize?.id));
    const segment = 360 / Math.max(wheelPrizes.length, 1);
    const landingAngle = 360 - (prizeIndex * segment + segment / 2);
    setRotation((current) => current + 1440 + landingAngle);
    window.setTimeout(() => {
      setResult(spinResult);
      setMessage(response.message);
      setSpinning(false);
      void load();
    }, 1300);
  }

  return (
    <AppShell>
      <PageTitle title="Voter Rewards Wheel" subtitle="Earn Voter Points from server-confirmed DoroCoin purchases, unlock tiered spin credits, and spin for non-cash rewards." icon={<Gift />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-5 sm:p-7 lg:p-8">
          <div className="grid gap-4 md:grid-cols-4">
            <RewardMetric label="Lifetime Points" value={points.toLocaleString()} />
            <RewardMetric label="Basic Credits" value={String(credits.basic ?? 0)} />
            <RewardMetric label="Standard Credits" value={String(credits.standard ?? 0)} />
            <RewardMetric label="Premium Credits" value={String(credits.premium ?? 0)} />
          </div>
          {nextTier ? <div className="mt-5 rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-sm font-bold text-[var(--gold)]">You need {pointsToNext.toLocaleString()} more points to unlock your next {nextTier.label} spin.</div> : <div className="mt-5 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-200">All current tiers reached. Future purchases keep adding lifetime points.</div>}

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {tiers.map((tier) => <button key={tier.id} type="button" onClick={() => setSelectedTier(tier.spinTier)} className={`rounded-[8px] border p-4 text-left transition ${selectedTier === tier.spinTier ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#151515] hover:border-[var(--gold)]/40"}`}><p className="text-lg font-black">{tier.label} Wheel</p><p className="mt-2 text-sm text-slate-400">{tier.pointsRequired} points unlocks {tier.spinCredits} {tier.spinTier} spin.</p><p className="mt-3 text-sm font-black text-[var(--gold)]">Available: {credits[tier.spinTier] ?? 0}</p></button>)}
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
            <div className="mx-auto w-full max-w-[360px]">
              <div className="relative aspect-square w-full">
                <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-b-[8px] border-x-[14px] border-t-[22px] border-x-transparent border-t-[var(--gold)]" />
                <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)]/80 bg-[#111] p-3 shadow-[0_0_45px_rgba(245,197,66,0.18)]">
                  <div className="relative h-full w-full overflow-hidden rounded-full transition-transform duration-[1300ms] ease-out" style={{ transform: `rotate(${rotation}deg)`, background: wheelGradient(wheelPrizes.length) }}>
                    {wheelPrizes.map((prize, index) => <div key={prize.id} className="absolute left-1/2 top-1/2 w-[44%] origin-left text-[10px] font-black uppercase leading-tight text-black" style={{ transform: `rotate(${index * (360 / wheelPrizes.length) + (180 / wheelPrizes.length)}deg) translateY(-50%)` }}><span className="block max-w-[86px] truncate rounded bg-white/75 px-2 py-1">{prize.prizeName}</span></div>)}
                    <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-black bg-[var(--gold)]" />
                  </div>
                </div>
              </div>
              <Button className="mt-5 w-full" onClick={spin} disabled={spinning || Number(credits[selectedTier] ?? 0) <= 0 || !wheelPrizes.length}>{spinning ? "Spinning..." : `Spin ${selectedTier[0].toUpperCase()}${selectedTier.slice(1)} Wheel`}</Button>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Selected wheel</p>
              <h2 className="mt-2 text-2xl font-black capitalize">{selectedTier} prizes</h2>
              {wheelPrizes.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{wheelPrizes.map((prize) => <div key={prize.id} className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4"><p className="font-black">{prize.prizeName}</p><p className="mt-1 text-xs text-slate-400">{prize.prizeType.replaceAll("_", " ")}{prize.manualFulfillmentRequired ? " · manual fulfillment" : " · safe server reward"}</p></div>)}</div> : <Card className="mt-5 border-dashed p-5 text-slate-400">No prizes are currently available for this wheel.</Card>}
              {Number(credits[selectedTier] ?? 0) <= 0 ? <p className="mt-5 rounded-[8px] bg-white/[0.04] p-4 text-sm text-slate-300">No {selectedTier} spin credits. {nextTier ? `You need ${pointsToNext.toLocaleString()} points for the next tier.` : "Buy DoroCoins to earn more Voter Points."}</p> : null}
            </div>
          </div>
          {message ? <p className="mt-6 rounded-[8px] bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</p> : null}
        </Card>
        <div className="space-y-6">
          <Card className={`bg-gradient-to-br p-6 sm:p-7 ${tierTone[selectedTier]}`}><Sparkles className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Reward safety</h2><p className="mt-3 text-sm leading-6 text-slate-300">The browser never chooses the prize. The server validates spin credits, selects the prize by configured weight, records history, and creates fulfillment review for manual rewards.</p></Card>
          <Card className="p-6 sm:p-7"><History className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Spin history</h2><p className="mt-3 text-sm leading-6 text-slate-300">Review every spin result and fulfillment status.</p><LinkButton href="/rewards/history" variant="secondary" className="mt-5 w-full">View History</LinkButton></Card>
        </div>
      </div>
      {result ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true"><Card className="w-full max-w-lg border-[var(--gold)]/30 p-6 text-center sm:p-8"><Trophy className="mx-auto h-12 w-12 text-[var(--gold)]" /><p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Spin Result</p><h2 className="mt-3 text-3xl font-black">{result.prize?.prizeName ?? "Prize recorded"}</h2><p className="mt-3 text-slate-300">{result.prize?.manualFulfillmentRequired ? "Your prize is pending fulfillment by the Challenge Suite team." : "Your result was recorded by the server. Safe reward application remains server-controlled."}</p><Button className="mt-6 w-full" onClick={() => setResult(null)}>Close</Button></Card></div> : null}
    </AppShell>
  );
}

function RewardMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-[#151515] p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold-2)]">{value}</p></div>;
}

function wheelGradient(count: number) {
  const colors = ["#f5c542", "#f7d86d", "#f0b429", "#fff3b0", "#d99b14", "#f8e18a"];
  const safeCount = Math.max(1, count);
  const segment = 100 / safeCount;
  const stops = Array.from({ length: safeCount }, (_, index) => `${colors[index % colors.length]} ${index * segment}% ${(index + 1) * segment}%`).join(", ");
  return `conic-gradient(${stops})`;
}

