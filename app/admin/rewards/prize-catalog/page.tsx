"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, Plus, Search, X } from "lucide-react";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Prize = { id: string; prizeName: string; prizeDescription: string; prizeTier: string; prizeType: string; rewardValue: number; status: string; enabled: boolean; quantityType: string; remainingQuantity: number | null; budgetId: string | null; updatedAt?: string | null };
type PrizeResponse = { prizes: Prize[] };

const initialForm = { prizeName: "", prizeDescription: "", prizeTier: "basic", prizeType: "reward_points", rewardValue: "", status: "draft", totalQuantity: "", deliveryCountries: "", fulfillmentInstructions: "", shippingPolicy: "", customsPolicy: "", budgetId: "", terms: "Rewards are subject to the configured fulfillment terms." };
const filters = ["all", "digital", "cash", "physical", "benefits", "recognition"] as const;

function category(prize: Prize) {
  if (prize.prizeType === "cash") return "cash";
  if (prize.prizeType === "physical_item") return "physical";
  if (["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"].includes(prize.prizeType)) return "benefits";
  if (prize.prizeType === "badge") return "recognition";
  return "digital";
}

function availability(prize: Prize) {
  if (!prize.enabled || prize.status !== "active") return "Not available";
  if (prize.quantityType === "limited") return `${Number(prize.remainingQuantity ?? 0).toLocaleString()} available`;
  return "Unlimited";
}

export default function AdminPrizeCatalogPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(initialForm);

  function load() { void apiRequest<PrizeResponse>("/api/admin/rewards/prizes").then((response) => { if (response.ok) setPrizes(response.data?.prizes ?? []); else setMessage(response.message); }); }
  useEffect(load, []);

  const visible = useMemo(() => prizes.filter((prize) => (filter === "all" || category(prize) === filter) && `${prize.prizeName} ${prize.prizeType}`.toLowerCase().includes(query.trim().toLowerCase())), [filter, prizes, query]);
  const physical = form.prizeType === "physical_item";
  const cash = form.prizeType === "cash";

  async function createPrize() {
    setBusy(true);
    const response = await apiRequest("/api/admin/rewards/prizes", { method: "POST", body: JSON.stringify({ ...form, rewardValue: Number(form.rewardValue), totalQuantity: physical ? Number(form.totalQuantity) : null, quantityType: physical ? "limited" : "unlimited", deliveryCountries: form.deliveryCountries.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean), enabled: form.status === "active" }) });
    setBusy(false); setMessage(response.message);
    if (response.ok) { setCreating(false); setForm(initialForm); load(); }
  }

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><PageTitle title="Prize Catalog" subtitle="Create and manage real Prize definitions, availability, inventory, budgets, and fulfilment." icon={<Gift />} /><Button onClick={() => setCreating(true)}><Plus size={17} /> Create Prize</Button></div>
    {message ? <Card className="mt-5 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Prize categories">{filters.map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`min-h-11 rounded-[8px] border px-4 text-sm font-bold capitalize ${filter === item ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-[var(--line)]"}`}>{item}</button>)}</div>
        <label className="relative block min-w-0 sm:min-w-72"><Search className="pointer-events-none absolute left-3 top-3.5" size={17} /><span className="sr-only">Search prizes</span><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prizes..." /></label>
      </div>
      <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-[var(--muted)]"><tr><th className="pb-3">Prize</th><th>Type</th><th>Availability</th><th>Budget</th><th>Status</th><th>Updated</th></tr></thead><tbody>{visible.map((prize) => <tr key={prize.id} className="border-t border-[var(--line)]"><td className="py-4 pr-4"><strong className="block">{prize.prizeName}</strong><span className="text-xs text-[var(--muted)]">{prize.prizeTier}</span></td><td className="pr-4 capitalize">{prize.prizeType.replaceAll("_", " ")}</td><td className="pr-4">{availability(prize)}</td><td className="pr-4">{prize.prizeType === "cash" ? prize.budgetId ? "Connected" : "Required" : "Not required"}</td><td className="pr-4 capitalize">{prize.status}</td><td>{prize.updatedAt ? new Date(prize.updatedAt).toLocaleDateString() : "Not recorded"}</td></tr>)}</tbody></table></div>
      {!visible.length ? <div className="py-14 text-center"><Gift className="mx-auto text-[var(--gold)]" /><h2 className="mt-3 font-black">No prizes found</h2><p className="mt-2 text-sm text-[var(--muted)]">Create a Prize before configuring a Spin Wheel.</p></div> : null}
    </Card>

    {creating ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-prize-title"><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="create-prize-title" className="text-2xl font-black">Create Prize</h2><p className="mt-2 text-sm text-[var(--muted)]">Define value and availability. Wheel inclusion is configured separately.</p></div><button type="button" onClick={() => setCreating(false)} aria-label="Close Prize creation" className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]"><X size={18} /></button></div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Prize name"><input autoFocus className={inputClass} value={form.prizeName} onChange={(event) => setForm((current) => ({ ...current, prizeName: event.target.value }))} /></Field><Field label="Tier"><select className={inputClass} value={form.prizeTier} onChange={(event) => setForm((current) => ({ ...current, prizeTier: event.target.value }))}><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></Field><Field label="Prize type"><select className={inputClass} value={form.prizeType} onChange={(event) => setForm((current) => ({ ...current, prizeType: event.target.value }))}><option value="reward_points">Reward Points</option><option value="dorocoin">DoroCoins</option><option value="cash">Cash</option><option value="physical_item">Physical Item</option><option value="free_entry">Free Entry</option><option value="fixed_entry_discount">Fixed Entry Discount</option><option value="percentage_entry_discount">Percentage Entry Discount</option><option value="creator_boost">Creator Boost</option><option value="bonus_spin">Bonus Spin</option><option value="badge">Badge</option></select></Field><Field label={cash ? "Amount in USD cents" : "Reward value"}><input className={inputClass} type="number" min="1" step="1" value={form.rewardValue} onChange={(event) => setForm((current) => ({ ...current, rewardValue: event.target.value }))} /></Field><Field label="Lifecycle"><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Draft</option><option value="active">Active</option></select></Field>{cash ? <Field label="Reward budget ID"><input className={inputClass} value={form.budgetId} onChange={(event) => setForm((current) => ({ ...current, budgetId: event.target.value }))} placeholder="Required funded budget" /></Field> : null}{physical ? <><Field label="Available quantity"><input className={inputClass} type="number" min="1" step="1" value={form.totalQuantity} onChange={(event) => setForm((current) => ({ ...current, totalQuantity: event.target.value }))} /></Field><Field label="Delivery country codes"><input className={inputClass} value={form.deliveryCountries} onChange={(event) => setForm((current) => ({ ...current, deliveryCountries: event.target.value }))} placeholder="US, CA" /></Field><Field label="Shipping policy"><textarea className={textareaClass} value={form.shippingPolicy} onChange={(event) => setForm((current) => ({ ...current, shippingPolicy: event.target.value }))} /></Field><Field label="Customs policy"><textarea className={textareaClass} value={form.customsPolicy} onChange={(event) => setForm((current) => ({ ...current, customsPolicy: event.target.value }))} /></Field><Field label="Fulfilment instructions"><textarea className={textareaClass} value={form.fulfillmentInstructions} onChange={(event) => setForm((current) => ({ ...current, fulfillmentInstructions: event.target.value }))} /></Field></> : null}<Field label="Description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(event) => setForm((current) => ({ ...current, prizeDescription: event.target.value }))} /></Field></div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={createPrize} disabled={busy || !form.prizeName.trim() || !Number(form.rewardValue) || (cash && !form.budgetId.trim()) || (physical && (!Number(form.totalQuantity) || !form.deliveryCountries.trim() || !form.shippingPolicy.trim() || !form.customsPolicy.trim() || !form.fulfillmentInstructions.trim()))}>{busy ? "Creating..." : "Create Prize"}</Button></div>
    </Card></div> : null}
  </>;
}
