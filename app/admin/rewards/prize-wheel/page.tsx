"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Gift, Save, Send } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { buildRewardWheelSegments } from "@/lib/reward-wheel-geometry";

const tiers = ["basic", "standard", "premium"] as const;
type Tier = (typeof tiers)[number];
type Prize = { id: string; prizeName: string; prizeTier: Tier; prizeType: string; probabilityWeight: number; rewardValue: number; status: string; enabled: boolean; quantityType: string; remainingQuantity?: number | null };
type Entry = { prizeId: string; weight: number };
type Version = { id: string; tier: Tier; pointCost: number; entries: Entry[]; status: "draft" | "published" | "retired"; immutable: boolean; updatedAt?: string | null };
type WheelData = { prizes: Prize[]; versions: Version[]; activeVersionIds: Record<Tier, string | null> };
type DraftResponse = { version: Version };

const fallbackCosts: Record<Tier, number> = { basic: 100, standard: 250, premium: 500 };
const palette = ["#f6c64b", "#25231f", "#d2a94b", "#f0dfad", "#171717"];
const emptyPrize = { prizeName: "", prizeDescription: "", prizeTier: "basic", prizeType: "reward_points", probabilityWeight: 1, quantityType: "unlimited", totalQuantity: "", status: "active", enabled: true, rewardValue: "", deliveryCountries: "", terms: "Rewards are subject to the configured fulfillment terms." };

function projectedCount(probability: number) { return Math.round(probability * 100_000).toLocaleString(); }

export default function AdminPrizeWheelPage() {
  const [data, setData] = useState<WheelData | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier>("basic");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [pointCost, setPointCost] = useState(100);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [prizeForm, setPrizeForm] = useState({ ...emptyPrize });

  function load() {
    apiRequest<WheelData>("/api/admin/rewards/wheels").then((response) => {
      if (response.ok && response.data) setData(response.data);
      else setMessage(response.message || "Reward wheel configuration could not load.");
    });
  }

  useEffect(load, []);

  const tierPrizes = useMemo(() => (data?.prizes ?? []).filter((prize) => prize.prizeTier === selectedTier && prize.enabled && prize.status !== "retired"), [data, selectedTier]);
  const tierVersions = useMemo(() => (data?.versions ?? []).filter((version) => version.tier === selectedTier), [data, selectedTier]);
  const activeId = data?.activeVersionIds?.[selectedTier] ?? null;

  useEffect(() => {
    if (!data) return;
    const draft = tierVersions.filter((version) => version.status === "draft").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const source = draft ?? tierVersions.find((version) => version.id === activeId) ?? null;
    setDraftId(draft?.id ?? null);
    setPointCost(source?.pointCost || fallbackCosts[selectedTier]);
    setWeights(Object.fromEntries((source?.entries ?? tierPrizes.map((prize) => ({ prizeId: prize.id, weight: prize.probabilityWeight }))).map((entry) => [entry.prizeId, entry.weight])));
    setReason("");
    setConfirmation("");
  }, [activeId, data, selectedTier, tierPrizes, tierVersions]);

  const entries = tierPrizes.flatMap((prize) => Number(weights[prize.id]) > 0 ? [{ prizeId: prize.id, weight: Number(weights[prize.id]) }] : []);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const previewItems = entries.map((entry) => ({ ...tierPrizes.find((prize) => prize.id === entry.prizeId)!, resolvedProbability: totalWeight ? entry.weight / totalWeight : 0 }));
  const segments = buildRewardWheelSegments(previewItems);
  const expectedRewardPoints = segments.reduce((sum, segment) => sum + (segment.prizeType === "reward_points" ? segment.rewardValue * segment.probability : 0), 0);
  const returnRatio = pointCost > 0 ? expectedRewardPoints / pointCost : 0;

  async function saveDraft() {
    setBusy(true);
    const response = await apiRequest<DraftResponse>("/api/admin/rewards/wheels", { method: "POST", body: JSON.stringify({ action: "save_draft", versionId: draftId, tier: selectedTier, pointCost, entries, reason }) });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) { setDraftId(response.data?.version.id ?? null); load(); }
  }

  async function publish() {
    if (!draftId) { setMessage("Save a draft before publishing."); return; }
    setBusy(true);
    const response = await apiRequest("/api/admin/rewards/wheels", { method: "POST", body: JSON.stringify({ action: "publish", versionId: draftId, reason, confirmation }) });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) load();
  }

  async function createPrize() {
    setBusy(true);
    const payload = { ...prizeForm, rewardValue: Number(prizeForm.rewardValue), totalQuantity: Number(prizeForm.totalQuantity || 0), deliveryCountries: prizeForm.deliveryCountries.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean) };
    const response = await apiRequest("/api/admin/rewards/prizes", { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) { setPrizeForm({ ...emptyPrize }); load(); }
  }

  return <AdminShell>
    <PageTitle title="Spin Wheel Configuration" subtitle="Build draft versions, inspect exact probabilities, and publish an immutable active wheel." icon={<Gift />} />
    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Wheel tiers">
      {tiers.map((item) => <button key={item} type="button" role="tab" aria-selected={selectedTier === item} onClick={() => setSelectedTier(item)} className={`min-h-11 rounded-[8px] border px-5 text-sm font-black capitalize ${selectedTier === item ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-[var(--line)] bg-[var(--panel)]"}`}>{item}</button>)}
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-black">Reward Table</h2><p className="mt-1 text-sm text-[var(--muted)]">Active: {activeId ?? "No active version"} · Editing: {draftId ?? "New draft"}</p></div><Field label="Spin cost"><input className={`${inputClass} w-32`} type="number" min="1" step="1" value={pointCost} onChange={(event) => setPointCost(Number(event.target.value))} /></Field></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs uppercase text-[var(--muted)]"><tr><th className="pb-3">Prize</th><th>Type</th><th>Weight</th><th>Exact probability</th></tr></thead><tbody>{tierPrizes.map((prize) => { const probability = totalWeight && Number(weights[prize.id]) > 0 ? Number(weights[prize.id]) / totalWeight : 0; return <tr key={prize.id} className="border-t border-[var(--line)]"><td className="py-3 pr-3 font-bold">{prize.prizeName}</td><td className="pr-3 capitalize">{prize.prizeType.replaceAll("_", " ")}</td><td className="pr-3"><input aria-label={`${prize.prizeName} weight`} className={`${inputClass} w-28`} type="number" min="0" step="0.001" value={weights[prize.id] ?? 0} onChange={(event) => setWeights((current) => ({ ...current, [prize.id]: Number(event.target.value) }))} /></td><td className="tabular-nums">{(probability * 100).toFixed(3)}%</td></tr>; })}</tbody></table></div>
        {!tierPrizes.length ? <p className="mt-5 rounded-[8px] border border-amber-400/30 bg-amber-400/10 p-4 text-sm">Add at least one active {selectedTier} prize before creating a wheel version.</p> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Change reason"><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the configuration change." /></Field><Field label="Publish confirmation"><input className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="PUBLISH REWARD WHEEL" /></Field></div>
        <div className="mt-5 flex flex-wrap gap-3"><Button onClick={saveDraft} disabled={busy || !entries.length}><Save size={17} /> Save Draft</Button><Button variant="secondary" onClick={publish} disabled={busy || !draftId || returnRatio >= 1}><Send size={17} /> Publish Version</Button></div>
      </Card>

      <div className="space-y-6">
        <Card className="p-5 sm:p-6"><h2 className="text-xl font-black">Wheel Preview</h2><p className="mt-1 text-sm text-[var(--muted)]">Preview uses the exact draft weights. It does not award or store rewards.</p>{segments.length ? <div className="mx-auto mt-5 aspect-square w-full max-w-[390px] rounded-full border-8 border-[#171717]" style={{ background: `conic-gradient(${segments.map((segment, index) => `${palette[index % palette.length]} ${segment.startAngle}deg ${segment.endAngle}deg`).join(",")})` }} role="img" aria-label={`${selectedTier} wheel probability preview`} /> : <div className="mt-5 flex aspect-square max-h-[390px] items-center justify-center rounded-full border border-dashed border-[var(--line)] text-center text-sm text-[var(--muted)]">No valid segments to preview.</div>}</Card>
        <Card className="p-5 sm:p-6"><h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 size={19} /> Economic Preview</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--muted)]">Expected points</dt><dd className="mt-1 text-xl font-black">{expectedRewardPoints.toFixed(2)}</dd></div><div><dt className="text-[var(--muted)]">Point return ratio</dt><dd className="mt-1 text-xl font-black">{(returnRatio * 100).toFixed(1)}%</dd></div></dl>{returnRatio >= 1 ? <p className="mt-4 flex gap-2 rounded-[8px] bg-red-500/10 p-3 text-sm text-red-700"><AlertTriangle size={18} /> Publish blocked at 100% or higher Reward Point return.</p> : returnRatio >= .85 ? <p className="mt-4 flex gap-2 rounded-[8px] bg-amber-400/10 p-3 text-sm text-amber-700"><AlertTriangle size={18} /> Review the high Reward Point return before publishing.</p> : null}<h3 className="mt-5 font-black">100,000 Spin projection</h3><div className="mt-3 space-y-2 text-sm">{segments.map((segment) => <div key={segment.id} className="flex justify-between gap-3"><span>{segment.prizeName}</span><span className="tabular-nums text-[var(--muted)]">{projectedCount(segment.probability)}</span></div>)}</div></Card>
      </div>
    </div>

    <Card className="mt-8 p-5 sm:p-6"><h2 className="text-xl font-black">Prize Catalog</h2><p className="mt-1 text-sm text-[var(--muted)]">Create real platform-funded prize definitions. Cash and physical prizes remain unavailable to users until included in a published wheel.</p><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Prize name"><input className={inputClass} value={prizeForm.prizeName} onChange={(event) => setPrizeForm((current) => ({ ...current, prizeName: event.target.value }))} /></Field><Field label="Tier"><select className={inputClass} value={prizeForm.prizeTier} onChange={(event) => setPrizeForm((current) => ({ ...current, prizeTier: event.target.value }))}>{tiers.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Prize type"><select className={inputClass} value={prizeForm.prizeType} onChange={(event) => setPrizeForm((current) => ({ ...current, prizeType: event.target.value, quantityType: event.target.value === "physical_item" ? "limited" : "unlimited" }))}><option value="reward_points">Reward Points</option><option value="dorocoin">DoroCoins</option><option value="cash">Cash (USD cents)</option><option value="physical_item">Physical Item</option><option value="free_entry">Free Entry</option><option value="fixed_entry_discount">Fixed Entry Discount</option><option value="percentage_entry_discount">Percentage Entry Discount</option><option value="creator_boost">Creator Boost</option><option value="bonus_spin">Bonus Spin</option><option value="badge">Badge</option></select></Field><Field label="Reward value"><input className={inputClass} type="number" min="1" value={prizeForm.rewardValue} onChange={(event) => setPrizeForm((current) => ({ ...current, rewardValue: event.target.value }))} /></Field>{prizeForm.prizeType === "physical_item" ? <><Field label="Inventory"><input className={inputClass} type="number" min="1" value={prizeForm.totalQuantity} onChange={(event) => setPrizeForm((current) => ({ ...current, totalQuantity: event.target.value }))} /></Field><Field label="Delivery country codes"><input className={inputClass} value={prizeForm.deliveryCountries} onChange={(event) => setPrizeForm((current) => ({ ...current, deliveryCountries: event.target.value }))} placeholder="US, CA" /></Field></> : null}</div><Button className="mt-5" onClick={createPrize} disabled={busy || !prizeForm.prizeName || !prizeForm.rewardValue}>Create Prize</Button></Card>
  </AdminShell>;
}
