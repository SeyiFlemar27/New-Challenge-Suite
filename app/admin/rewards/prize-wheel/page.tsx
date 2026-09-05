"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Equal, Gift, History, Plus, Search, Send, Trash2, X } from "lucide-react";
import { RewardWheelVisual } from "@/components/rewards/reward-wheel-visual";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { REWARD_WHEEL_POINT_COSTS, REWARD_WHEEL_PROBABILITY_UNITS, distributeProbabilityUnits, probabilityPercent, probabilityUnitsFromPercent, probabilityUnitsFromRelativeWeights } from "@/lib/reward-wheel-contracts";

const tiers = ["basic", "standard", "premium"] as const;
type Tier = (typeof tiers)[number];
type Prize = { id: string; prizeName: string; prizeTier: Tier; prizeType: string; probabilityWeight: number; rewardValue: number; economicValueCents?: number; budgetId?: string | null; status: string; enabled: boolean; quantityType: string; remainingQuantity?: number | null; deliveryCountries?: string[]; shippingPolicy?: string | null; customsPolicy?: string | null; fulfillmentInstructions?: string | null };
type Entry = { prizeId: string; weight: number; probabilityUnits?: number };
type Version = { id: string; tier: Tier; pointCost: number; entries: Entry[]; status: "draft" | "published" | "retired"; immutable: boolean; reason?: string | null; revision: number; updatedAt?: string | null; publishedAt?: string | null; publishedByAdminId?: string | null };
type WheelData = { prizes: Prize[]; versions: Version[]; activeVersionIds: Record<Tier, string | null> };
type DraftResponse = { version: Version };
type EditableEntry = { prizeId: string; probabilityUnits: number };

const tierLabels: Record<Tier, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };
const supportedRewardTypes = new Set(["reward_points", "dorocoin", "cash", "free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"]);

function editableEntries(entries: Entry[]): EditableEntry[] {
  if (entries.length && entries.every((entry) => Number.isInteger(entry.probabilityUnits) && Number(entry.probabilityUnits) > 0)) return entries.map((entry) => ({ prizeId: entry.prizeId, probabilityUnits: Number(entry.probabilityUnits) }));
  return probabilityUnitsFromRelativeWeights(entries.map((entry) => ({ prizeId: entry.prizeId, weight: entry.weight })));
}

function prizeAvailability(prize: Prize) {
  if (!supportedRewardTypes.has(prize.prizeType)) return { available: false, reason: "This reward type is not supported in the current Wheel release." };
  if (!prize.enabled || prize.status !== "active") return { available: false, reason: "Prize is not active." };
  if (prize.rewardValue <= 0) return { available: false, reason: "Prize value is incomplete." };
  if (prize.prizeType === "cash" && (!prize.budgetId || !Number(prize.economicValueCents))) return { available: false, reason: "A funded Cash budget is required." };
  if (prize.prizeType === "physical_item" && (prize.quantityType !== "limited" || !Number(prize.remainingQuantity) || !prize.deliveryCountries?.length || !prize.shippingPolicy || !prize.customsPolicy || !prize.fulfillmentInstructions)) return { available: false, reason: "Inventory and fulfilment details are incomplete." };
  return { available: true, reason: prize.quantityType === "limited" ? `${Number(prize.remainingQuantity).toLocaleString()} available` : "Unlimited" };
}

function versionTime(value?: string | null) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded"; }

export default function AdminPrizeWheelPage() {
  const [data, setData] = useState<WheelData | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier>("basic");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const pointCost = REWARD_WHEEL_POINT_COSTS[selectedTier];
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState("all");
  const [publishOpen, setPublishOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [economicsOpen, setEconomicsOpen] = useState(false);
  const initializedRef = useRef(false);
  const lastSavedRef = useRef("");

  function load() { void apiRequest<WheelData>("/api/admin/rewards/wheels").then((response) => { if (response.ok && response.data) setData(response.data); else setMessage(response.message || "This Wheel configuration could not be loaded. The active Wheel remains unchanged."); }); }
  useEffect(load, []);

  const tierPrizes = useMemo(() => (data?.prizes ?? []).filter((prize) => prize.prizeTier === selectedTier), [data, selectedTier]);
  const tierVersions = useMemo(() => (data?.versions ?? []).filter((version) => version.tier === selectedTier).sort((a, b) => String(b.updatedAt ?? b.publishedAt).localeCompare(String(a.updatedAt ?? a.publishedAt))), [data, selectedTier]);
  const activeId = data?.activeVersionIds?.[selectedTier] ?? null;
  const activeVersion = tierVersions.find((version) => version.id === activeId) ?? null;
  const draftVersion = tierVersions.find((version) => version.status === "draft") ?? null;

  useEffect(() => {
    if (!data) return;
    const source = draftVersion ?? activeVersion;
    const nextEntries = editableEntries(source?.entries ?? []);
    setDraftId(draftVersion?.id ?? null); setRevision(draftVersion?.revision ?? 0); setEntries(nextEntries); setMessage(""); setSaveState("idle");
    lastSavedRef.current = JSON.stringify({ pointCost, entries: nextEntries }); initializedRef.current = true;
  }, [activeVersion, data, draftVersion, pointCost, selectedTier]);

  const includedPrizes = entries.map((entry) => ({ entry, prize: tierPrizes.find((prize) => prize.id === entry.prizeId) })).filter((row): row is { entry: EditableEntry; prize: Prize } => Boolean(row.prize));
  const totalUnits = entries.reduce((sum, entry) => sum + entry.probabilityUnits, 0);
  const totalPercent = probabilityPercent(totalUnits);
  const exactTotal = totalUnits === REWARD_WHEEL_PROBABILITY_UNITS;
  const previewItems = includedPrizes.filter((row) => row.entry.probabilityUnits > 0).map(({ entry, prize }) => ({ id: prize.id, prizeName: prize.prizeName, resolvedProbability: entry.probabilityUnits / Math.max(1, totalUnits), prizeType: prize.prizeType, rewardValue: prize.rewardValue }));
  const expectedRewardPoints = previewItems.reduce((sum, item) => sum + (item.prizeType === "reward_points" ? item.rewardValue * Number(item.resolvedProbability) : 0), 0);
  const returnRatio = pointCost > 0 ? expectedRewardPoints / pointCost : 0;
  const highRisk = includedPrizes.some(({ prize }) => ["cash", "physical_item"].includes(prize.prizeType));
  const canPublish = Boolean(draftId && entries.length >= 4 && entries.every((entry) => entry.probabilityUnits > 0) && exactTotal && returnRatio < 1);
  const signature = JSON.stringify({ pointCost, entries });

  useEffect(() => {
    if (!initializedRef.current || !entries.length || signature === lastSavedRef.current) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      const response = await apiRequest<DraftResponse>("/api/admin/rewards/wheels", { method: "POST", body: JSON.stringify({ action: "save_draft", versionId: draftId, tier: selectedTier, pointCost, entries: entries.map((entry) => ({ ...entry, weight: entry.probabilityUnits })), expectedRevision: revision }) });
      if (!response.ok || !response.data?.version) { setSaveState("error"); setMessage(response.message || "Draft could not be saved."); if (response.code === "WHEEL_DRAFT_CONFLICT") load(); return; }
      setDraftId(response.data.version.id); setRevision(response.data.version.revision); lastSavedRef.current = signature; setSaveState("saved");
    }, 850);
    return () => window.clearTimeout(timer);
  }, [draftId, entries, pointCost, revision, selectedTier, signature]);

  const pickerPrizes = tierPrizes.filter((prize) => !entries.some((entry) => entry.prizeId === prize.id) && (pickerCategory === "all" || prize.prizeType === pickerCategory) && `${prize.prizeName} ${prize.prizeType}`.toLowerCase().includes(pickerQuery.trim().toLowerCase()));
  function addPrize(prizeId: string) { setEntries((current) => distributeProbabilityUnits([...current.map((entry) => entry.prizeId), prizeId])); setPickerOpen(false); }
  function removePrize(prizeId: string) { setEntries((current) => current.filter((entry) => entry.prizeId !== prizeId)); }
  function setChance(prizeId: string, percent: number) { setEntries((current) => current.map((entry) => entry.prizeId === prizeId ? { ...entry, probabilityUnits: Math.max(0, probabilityUnitsFromPercent(percent)) } : entry)); }

  async function publish() {
    if (!draftId || !canPublish) return;
    setBusy(true); const response = await apiRequest("/api/admin/rewards/wheels", { method: "POST", body: JSON.stringify({ action: "publish", versionId: draftId, reason, confirmation }) }); setBusy(false); setMessage(response.message);
    if (response.ok) { setPublishOpen(false); setReason(""); setConfirmation(""); initializedRef.current = false; load(); }
  }

  async function cloneVersion(versionId: string) { setBusy(true); const response = await apiRequest("/api/admin/rewards/wheels", { method: "POST", body: JSON.stringify({ action: "clone_version", versionId }) }); setBusy(false); setMessage(response.message); if (response.ok) { initializedRef.current = false; load(); } }

  return <>
    <PageTitle title="Spin Wheel Configuration" subtitle="Configure the rewards and winning chances for each Spin tier." icon={<Gift />} />
    {message ? <Card className="mt-5 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <div className="mt-6 grid gap-3 md:grid-cols-3" role="tablist" aria-label="Wheel tiers">{tiers.map((item) => { const itemActive = data?.activeVersionIds?.[item]; const itemDraft = data?.versions.some((version) => version.tier === item && version.status === "draft"); const itemCost = REWARD_WHEEL_POINT_COSTS[item]; return <button key={item} type="button" role="tab" aria-selected={selectedTier === item} onClick={() => { initializedRef.current = false; setSelectedTier(item); }} className={`min-h-24 rounded-[8px] border p-4 text-left ${selectedTier === item ? "border-[var(--gold)] bg-amber-50" : "border-[var(--line)] bg-[var(--panel)]"}`}><strong className="block text-lg">{tierLabels[item]}</strong><span className="mt-1 block text-sm">{itemCost ? `${itemCost.toLocaleString()} points` : "No active cost"}</span><span className="mt-2 block text-xs font-bold text-[var(--muted)]">{itemDraft ? "Draft" : itemActive ? "Published" : "Not configured"}</span></button>; })}</div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
      <div className="space-y-6">
        <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[var(--gold)]">1 Rewards</p><h2 className="mt-2 text-xl font-black">Rewards on this Wheel</h2><p className="mt-1 text-sm text-[var(--muted)]">Only included Catalog Prizes appear here.</p></div><Button onClick={() => setPickerOpen(true)}><Plus size={17} /> Add Reward</Button></div>
          <div className="mt-5 space-y-3">{includedPrizes.map(({ prize }) => <div key={prize.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] p-4"><div><strong>{prize.prizeName}</strong><span className="mt-1 block text-xs capitalize text-[var(--muted)]">{prize.prizeType.replaceAll("_", " ")}</span></div><button type="button" onClick={() => removePrize(prize.id)} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]" aria-label={`Remove ${prize.prizeName}`}><Trash2 size={17} /></button></div>)}</div>
          {!includedPrizes.length ? <div className="mt-5 rounded-[8px] border border-dashed border-[var(--line)] p-8 text-center"><Gift className="mx-auto text-[var(--gold)]" /><h3 className="mt-3 font-black">No rewards on this Wheel yet</h3><p className="mt-2 text-sm text-[var(--muted)]">Add at least four unique Prizes to publish.</p></div> : includedPrizes.length < 4 ? <p className="mt-4 text-sm font-bold text-amber-700">Add {4 - includedPrizes.length} more unique {includedPrizes.length === 3 ? "Prize" : "Prizes"} before publishing.</p> : null}
          <LinkButton className="mt-5" href="/admin/rewards/prize-catalog" variant="secondary">Manage Prize Catalog</LinkButton>
        </Card>

        <Card className="p-5 sm:p-6"><p className="text-xs font-black uppercase text-[var(--gold)]">2 Chances</p><div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-black">Set Winning Chances</h2><p className="mt-1 text-sm text-[var(--muted)]">Enter exact percentages. The published total must equal 100%.</p></div><Button variant="secondary" onClick={() => setEntries(distributeProbabilityUnits(entries.map((entry) => entry.prizeId)))} disabled={!entries.length}><Equal size={17} /> Distribute Evenly</Button></div>
          <div className="mt-5 space-y-3">{includedPrizes.map(({ entry, prize }) => <div key={prize.id} className="grid items-center gap-3 rounded-[8px] border border-[var(--line)] p-4 sm:grid-cols-[minmax(0,1fr)_130px]"><label className="font-bold" htmlFor={`chance-${prize.id}`}>{prize.prizeName}</label><div className="relative"><input id={`chance-${prize.id}`} className={`${inputClass} pr-9 text-right tabular-nums`} type="number" min="0" max="100" step="0.0001" value={Number(probabilityPercent(entry.probabilityUnits).toFixed(4))} onChange={(event) => setChance(prize.id, Number(event.target.value))} /><span className="pointer-events-none absolute right-3 top-3 text-sm font-bold">%</span></div>{entry.probabilityUnits === 0 ? <p className="text-sm text-amber-700 sm:col-span-2">A 0% Prize will not appear. Remove it or assign a winning chance.</p> : null}</div>)}</div>
          <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border p-4 ${exactTotal ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}><strong>Total</strong><strong className="text-xl tabular-nums">{totalPercent.toFixed(4)}%</strong><span className="basis-full text-sm">{exactTotal ? "Winning chances are fully allocated." : totalUnits > REWARD_WHEEL_PROBABILITY_UNITS ? `Reduce the chances by ${(totalPercent - 100).toFixed(4)}% before publishing.` : `Allocate the remaining ${(100 - totalPercent).toFixed(4)}% before publishing.`}</span></div>
          <Field label="Spin Cost"><div className="mt-2 rounded-[8px] border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3"><strong>{pointCost.toLocaleString()} Reward Points</strong><span className="mt-1 block text-xs text-[var(--muted)]">Spin costs are fixed for this tier.</span></div></Field>
          <button type="button" onClick={() => setAdvanced((value) => !value)} className="mt-5 flex min-h-11 items-center gap-2 text-sm font-bold" aria-expanded={advanced}><ChevronDown size={17} className={advanced ? "rotate-180" : ""} /> Advanced Configuration</button>{advanced ? <div className="rounded-[8px] border border-[var(--line)] p-4 text-sm"><p>Canonical precision: {REWARD_WHEEL_PROBABILITY_UNITS.toLocaleString()} units = 100%.</p><div className="mt-3 space-y-2">{includedPrizes.map(({ entry, prize }) => <div key={prize.id} className="flex justify-between gap-3"><span>{prize.prizeName}</span><span className="tabular-nums">{entry.probabilityUnits.toLocaleString()} units</span></div>)}</div></div> : null}
          <p className="mt-4 text-sm text-[var(--muted)]" aria-live="polite">{saveState === "saving" ? "Saving Draft..." : saveState === "saved" ? "Draft saved" : saveState === "error" ? "Draft could not be saved. Review the message above and retry." : draftVersion ? "Draft ready" : "Changes will create a Draft automatically."}</p>
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-6">
        <Card className="p-5 sm:p-6"><p className="text-xs font-black uppercase text-[var(--gold)]">3 Review</p><h2 className="mt-2 text-xl font-black">Real Wheel Preview</h2><p className="mt-1 text-sm text-[var(--muted)]">This preview never creates a Spin, debit, award, or reservation.</p>{previewItems.length ? <div className="mx-auto mt-5 w-full max-w-[390px]"><RewardWheelVisual items={previewItems} label={`${tierLabels[selectedTier]} Draft Wheel preview`} showPointer={false} centerLabel="PREVIEW" showAccessibleProbabilities /></div> : <div className="mt-5 aspect-square max-h-[390px] rounded-full border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--muted)] grid place-items-center">Add rewards with positive chances to preview the Wheel.</div>}
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--muted)]">Spin Cost</dt><dd className="mt-1 font-black">{pointCost.toLocaleString()} points</dd></div><div><dt className="text-[var(--muted)]">Rewards</dt><dd className="mt-1 font-black">{includedPrizes.length}</dd></div><div><dt className="text-[var(--muted)]">Total Chance</dt><dd className="mt-1 font-black">{totalPercent.toFixed(4)}%</dd></div><div><dt className="text-[var(--muted)]">Status</dt><dd className="mt-1 font-black">{canPublish ? "Ready to publish" : "Needs attention"}</dd></div></dl>
          <button type="button" onClick={() => setEconomicsOpen((value) => !value)} className="mt-5 flex min-h-11 items-center gap-2 text-sm font-bold" aria-expanded={economicsOpen}><ChevronDown size={17} className={economicsOpen ? "rotate-180" : ""} /> Economic Analysis</button>{economicsOpen ? <div className="rounded-[8px] border border-[var(--line)] p-4"><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--muted)]">Expected Reward Points</dt><dd className="font-black">{expectedRewardPoints.toFixed(2)}</dd></div><div><dt className="text-[var(--muted)]">Point return ratio</dt><dd className="font-black">{(returnRatio * 100).toFixed(2)}%</dd></div></dl>{returnRatio >= 1 ? <p className="mt-4 flex gap-2 text-sm text-red-700"><AlertTriangle size={17} /> Publishing is blocked at a 100% or greater Reward Point return.</p> : returnRatio >= .85 ? <p className="mt-4 flex gap-2 text-sm text-amber-700"><AlertTriangle size={17} /> Review the high Reward Point return.</p> : <p className="mt-4 flex gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} /> Reward Point guardrail passed.</p>}</div> : null}
        </Card>
        <Card className="p-5 sm:p-6"><p className="text-xs font-black uppercase text-[var(--gold)]">4 Publish</p><h2 className="mt-2 text-xl font-black">Publish this tier</h2><p className="mt-2 text-sm text-[var(--muted)]">Only a successful publish replaces the active {tierLabels[selectedTier]} Wheel seen by users.</p><Button className="mt-5 w-full" onClick={() => setPublishOpen(true)} disabled={!canPublish || busy}><Send size={17} /> Review & Publish</Button></Card>
      </div>
    </div>

    <Card className="mt-7 p-5 sm:p-6"><div className="flex items-center gap-3"><History className="text-[var(--gold)]" /><div><h2 className="text-xl font-black">Version History</h2><p className="text-sm text-[var(--muted)]">Published versions are immutable. Reuse creates a new Draft.</p></div></div><div className="mt-5 divide-y divide-[var(--line)]">{tierVersions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><strong>{tierLabels[selectedTier]} {version.id === activeId ? "Active Version" : version.status === "draft" ? "Draft" : "Replaced Version"}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{version.status === "published" ? `Published ${versionTime(version.publishedAt)}` : `Edited ${versionTime(version.updatedAt)}`}</span></div><div className="flex flex-wrap gap-2"><span className="rounded-[6px] border border-[var(--line)] px-3 py-2 text-xs font-bold capitalize">{version.id === activeId ? "Active" : version.status}</span>{version.status !== "draft" ? <Button variant="secondary" onClick={() => cloneVersion(version.id)} disabled={busy}>Use as New Draft</Button> : null}</div></div>)}</div>{!tierVersions.length ? <p className="py-8 text-center text-sm text-[var(--muted)]">No versions exist for this tier yet.</p> : null}</Card>

    {pickerOpen ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="add-reward-title"><Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="add-reward-title" className="text-2xl font-black">Add Rewards</h2><p className="mt-2 text-sm text-[var(--muted)]">Choose real, available Prizes from the Catalog.</p></div><button type="button" onClick={() => setPickerOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]" aria-label="Close reward picker"><X size={18} /></button></div><label className="relative mt-5 block"><Search className="pointer-events-none absolute left-3 top-3.5" size={17} /><span className="sr-only">Search rewards</span><input autoFocus className={`${inputClass} pl-10`} value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Search rewards..." /></label><div className="mt-4 flex flex-wrap gap-2">{["all", "reward_points", "dorocoin", "cash", "physical_item", "free_entry", "badge"].map((item) => <button key={item} type="button" onClick={() => setPickerCategory(item)} className={`min-h-10 rounded-[8px] border px-3 text-xs font-bold capitalize ${pickerCategory === item ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-[var(--line)]"}`}>{item.replaceAll("_", " ")}</button>)}</div><div className="mt-5 space-y-3">{pickerPrizes.map((prize) => { const availability = prizeAvailability(prize); return <div key={prize.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[var(--line)] p-4"><div><strong>{prize.prizeName}</strong><span className="mt-1 block text-xs capitalize text-[var(--muted)]">{prize.prizeType.replaceAll("_", " ")} · {availability.reason}</span></div><Button onClick={() => addPrize(prize.id)} disabled={!availability.available}>Add</Button></div>; })}</div>{!pickerPrizes.length ? <p className="py-10 text-center text-sm text-[var(--muted)]">No matching Catalog Prizes are available.</p> : null}</Card></div> : null}

    {publishOpen ? <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="publish-wheel-title"><Card className="max-h-[92vh] w-full max-w-xl overflow-y-auto p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="publish-wheel-title" className="text-2xl font-black">Publish {tierLabels[selectedTier]} Wheel</h2><p className="mt-2 text-sm text-[var(--muted)]">This replaces the currently active configuration for this tier only.</p></div><button type="button" onClick={() => setPublishOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]" aria-label="Close publish dialog"><X size={18} /></button></div><dl className="mt-6 grid grid-cols-2 gap-4 rounded-[8px] border border-[var(--line)] p-4 text-sm"><div><dt className="text-[var(--muted)]">Current Version</dt><dd className="font-black">{activeId ?? "None"}</dd></div><div><dt className="text-[var(--muted)]">New Version</dt><dd className="font-black">{draftId}</dd></div><div><dt className="text-[var(--muted)]">Spin Cost</dt><dd className="font-black">{pointCost.toLocaleString()} points</dd></div><div><dt className="text-[var(--muted)]">Rewards</dt><dd className="font-black">{entries.length}</dd></div><div><dt className="text-[var(--muted)]">Total Probability</dt><dd className="font-black">{totalPercent.toFixed(4)}%</dd></div><div><dt className="text-[var(--muted)]">Economic Checks</dt><dd className="font-black">Passed</dd></div></dl>{highRisk ? <p className="mt-4 flex gap-2 rounded-[8px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} /> This Wheel contains Cash or Physical Prizes. Review budget, inventory, and fulfilment before publishing.</p> : null}<Field label="Reason for change"><textarea autoFocus className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Field label="Type PUBLISH REWARD WHEEL to confirm"><input className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setPublishOpen(false)}>Cancel</Button><Button onClick={publish} disabled={busy || reason.trim().length < 8 || confirmation !== "PUBLISH REWARD WHEEL"}>{busy ? "Publishing..." : "Publish Wheel"}</Button></div></Card></div> : null}
  </>;
}
