"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Copy, Eye, Gift, MoreVertical, Pause, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Prize = {
  id: string;
  prizeName: string;
  prizeDescription: string;
  prizeTier: string;
  prizeType: string;
  rewardValue: number;
  maximumDiscountCents: number | null;
  entitlementExpiresAt: string | null;
  terms: string;
  status: string;
  enabled: boolean;
  quantityType: string;
  remainingQuantity: number | null;
  budgetId: string | null;
  updatedAt?: string | null;
};

type PrizeResponse = { prizes: Prize[] };
type PrizeForm = typeof initialForm;

const initialForm = {
  prizeName: "",
  prizeDescription: "",
  prizeTier: "basic",
  prizeType: "reward_points",
  rewardValue: "",
  maximumDiscountCents: "",
  entitlementExpiresAt: "",
  status: "draft",
  budgetId: "",
  terms: "Rewards are subject to the configured fulfillment terms.",
};

const filters = ["all", "digital", "cash", "benefits"] as const;

function category(prize: Prize) {
  if (["physical_item", "badge"].includes(prize.prizeType)) return "legacy";
  if (prize.prizeType === "cash") return "cash";
  if (["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"].includes(prize.prizeType)) return "benefits";
  return "digital";
}

function availability(prize: Prize) {
  if (!prize.enabled || prize.status !== "active") return "Not available";
  if (prize.quantityType === "limited") return `${Number(prize.remainingQuantity ?? 0).toLocaleString()} available`;
  return "Unlimited";
}

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formFromPrize(prize: Prize): PrizeForm {
  return {
    prizeName: prize.prizeName,
    prizeDescription: prize.prizeDescription,
    prizeTier: prize.prizeTier || "basic",
    prizeType: prize.prizeType,
    rewardValue: String(prize.rewardValue),
    maximumDiscountCents: prize.maximumDiscountCents == null ? "" : String(prize.maximumDiscountCents),
    entitlementExpiresAt: datetimeLocal(prize.entitlementExpiresAt),
    status: prize.status,
    budgetId: prize.budgetId ?? "",
    terms: prize.terms,
  };
}

function prizePayload(form: PrizeForm) {
  const creatorBoost = form.prizeType === "creator_boost";
  return {
    ...form,
    rewardValue: creatorBoost ? 3 : Number(form.rewardValue),
    unit: creatorBoost ? "days" : undefined,
    entitlementExpiresAt: form.entitlementExpiresAt ? new Date(form.entitlementExpiresAt).toISOString() : null,
    quantityType: "unlimited",
    deliveryCountries: [],
    enabled: form.status === "active",
  };
}

export default function AdminPrizeCatalogPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingPrize, setViewingPrize] = useState<Prize | null>(null);
  const [menuPrizeId, setMenuPrizeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(initialForm);

  function load() {
    void apiRequest<PrizeResponse>("/api/admin/rewards/prizes").then((response) => {
      if (response.ok) setPrizes(response.data?.prizes ?? []);
      else setMessage(response.message);
    });
  }

  useEffect(load, []);

  const visible = useMemo(() => prizes.filter((prize) =>
    (filter === "all" || category(prize) === filter)
    && `${prize.prizeName} ${prize.prizeType}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [filter, prizes, query]);

  const cash = form.prizeType === "cash";
  const percentageDiscount = form.prizeType === "percentage_entry_discount";
  const creatorBoost = form.prizeType === "creator_boost";

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setEditorOpen(true);
  }

  function openEdit(prize: Prize) {
    setEditingId(prize.id);
    setForm(formFromPrize(prize));
    setMenuPrizeId(null);
    setEditorOpen(true);
  }

  function duplicatePrize(prize: Prize) {
    setEditingId(null);
    setForm({ ...formFromPrize(prize), prizeName: `${prize.prizeName} copy`, status: "draft" });
    setMenuPrizeId(null);
    setEditorOpen(true);
  }

  async function savePrize() {
    setBusy(true);
    const response = await apiRequest(editingId ? `/api/admin/rewards/prizes/${editingId}` : "/api/admin/rewards/prizes", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(prizePayload(form)),
    });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) {
      setEditorOpen(false);
      setEditingId(null);
      setForm(initialForm);
      load();
    }
  }

  async function setPrizeStatus(prize: Prize, status: "active" | "paused" | "archived") {
    setBusy(true);
    setMenuPrizeId(null);
    const response = await apiRequest(`/api/admin/rewards/prizes/${prize.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "set_status", status }),
    });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) load();
  }

  async function permanentlyDelete(prize: Prize) {
    setMenuPrizeId(null);
    if (!window.confirm(`Permanently delete ${prize.prizeName}? This is allowed only when the Prize has never been referenced.`)) return;
    setBusy(true);
    const response = await apiRequest(`/api/admin/rewards/prizes/${prize.id}?permanent=true`, { method: "DELETE" });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) load();
  }

  const invalidForm = !form.prizeName.trim()
    || (!creatorBoost && !Number(form.rewardValue))
    || (cash && !form.budgetId.trim())
    || (percentageDiscount && !Number(form.maximumDiscountCents));

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <PageTitle title="Prize Catalog" subtitle="Create reusable Prize definitions, then assign them to any Wheel tier." icon={<Gift />} />
      <Button onClick={openCreate}><Plus size={17} /> Create Prize</Button>
    </div>
    {message ? <Card className="mt-5 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Prize categories">
          {filters.map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`min-h-11 rounded-[8px] border px-4 text-sm font-bold capitalize ${filter === item ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-[var(--line)]"}`}>{item}</button>)}
        </div>
        <label className="relative block min-w-0 sm:min-w-72">
          <Search className="pointer-events-none absolute left-3 top-3.5" size={17} />
          <span className="sr-only">Search Prizes</span>
          <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Prizes..." />
        </label>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]"><tr><th className="pb-3">Prize</th><th>Type</th><th>Availability</th><th>Budget</th><th>Status</th><th>Updated</th><th className="text-right">Actions</th></tr></thead>
          <tbody>{visible.map((prize) => <tr key={prize.id} className="border-t border-[var(--line)]">
            <td className="py-4 pr-4"><strong className="block">{prize.prizeName}</strong><span className="text-xs text-[var(--muted)]">Reusable reward definition</span></td>
            <td className="pr-4 capitalize">{prize.prizeType.replaceAll("_", " ")}</td>
            <td className="pr-4">{availability(prize)}</td>
            <td className="pr-4">{prize.prizeType === "cash" ? prize.budgetId ? "Connected" : "Required" : "Not required"}</td>
            <td className="pr-4 capitalize">{prize.status}</td>
            <td>{prize.updatedAt ? new Date(prize.updatedAt).toLocaleDateString() : "Not recorded"}</td>
            <td className="relative py-3 text-right">
              <button type="button" title="Prize actions" aria-label={`Actions for ${prize.prizeName}`} aria-expanded={menuPrizeId === prize.id} onClick={() => setMenuPrizeId((current) => current === prize.id ? null : prize.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]"><MoreVertical size={17} /></button>
              {menuPrizeId === prize.id ? <div className="absolute right-0 top-12 z-20 w-48 rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-1 text-left shadow-xl" role="menu">
                <button type="button" role="menuitem" onClick={() => { setViewingPrize(prize); setMenuPrizeId(null); }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Eye size={15} /> View</button>
                {prize.status !== "archived" ? <button type="button" role="menuitem" onClick={() => openEdit(prize)} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Pencil size={15} /> Edit</button> : null}
                <button type="button" role="menuitem" onClick={() => duplicatePrize(prize)} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Copy size={15} /> Duplicate</button>
                {prize.status === "active" ? <button type="button" role="menuitem" disabled={busy} onClick={() => void setPrizeStatus(prize, "paused")} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Pause size={15} /> Pause</button> : null}
                {prize.status === "paused" ? <button type="button" role="menuitem" disabled={busy} onClick={() => void setPrizeStatus(prize, "active")} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Play size={15} /> Resume</button> : null}
                {prize.status === "draft" ? <button type="button" role="menuitem" disabled={busy} onClick={() => void setPrizeStatus(prize, "active")} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Play size={15} /> Activate</button> : null}
                {prize.status !== "archived" ? <button type="button" role="menuitem" disabled={busy} onClick={() => void setPrizeStatus(prize, "archived")} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold hover:bg-[var(--panel-2)]"><Archive size={15} /> Archive</button> : null}
                {prize.status === "archived" ? <button type="button" role="menuitem" disabled={busy} onClick={() => void permanentlyDelete(prize)} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"><Trash2 size={15} /> Delete permanently</button> : null}
              </div> : null}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      {!visible.length ? <div className="py-14 text-center"><Gift className="mx-auto text-[var(--gold)]" /><h2 className="mt-3 font-black">No Prizes found</h2><p className="mt-2 text-sm text-[var(--muted)]">Create a Prize before configuring a Spin Wheel.</p></div> : null}
    </Card>

    {editorOpen ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="prize-editor-title">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="prize-editor-title" className="text-2xl font-black">{editingId ? "Edit Prize" : "Create Prize"}</h2><p className="mt-2 text-sm text-[var(--muted)]">Define the reward once. Wheel tier and probability are configured separately.</p></div><button type="button" onClick={() => setEditorOpen(false)} aria-label="Close Prize editor" className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]"><X size={18} /></button></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Prize name"><input autoFocus className={inputClass} value={form.prizeName} onChange={(event) => setForm((current) => ({ ...current, prizeName: event.target.value }))} /></Field>
          <Field label="Prize type"><select className={inputClass} value={form.prizeType} onChange={(event) => setForm((current) => ({ ...current, prizeType: event.target.value, rewardValue: event.target.value === "creator_boost" ? "3" : current.rewardValue }))}><option value="reward_points">Reward Points</option><option value="dorocoin">DoroCoins</option><option value="cash">Cash</option><option value="free_entry">Free Entry</option><option value="fixed_entry_discount">Fixed Entry Discount</option><option value="percentage_entry_discount">Percentage Entry Discount</option><option value="creator_boost">Creator Boost</option><option value="bonus_spin">Bonus Spin</option></select></Field>
          <Field label={creatorBoost ? "Boost duration" : cash ? "Amount in USD cents" : "Reward value"}><input className={inputClass} type="number" min="1" step="1" value={creatorBoost ? "3" : form.rewardValue} disabled={creatorBoost} onChange={(event) => setForm((current) => ({ ...current, rewardValue: event.target.value }))} />{creatorBoost ? <span className="mt-1 block text-xs text-[var(--muted)]">Creator Boost is fixed at 3 days.</span> : null}</Field>
          {percentageDiscount ? <Field label="Maximum discount in USD cents"><input className={inputClass} type="number" min="1" step="1" value={form.maximumDiscountCents} onChange={(event) => setForm((current) => ({ ...current, maximumDiscountCents: event.target.value }))} /><span className="mt-1 block text-xs text-[var(--muted)]">Required. The percentage discount cannot exceed this amount.</span></Field> : null}
          <Field label="Lifecycle"><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></Field>
          {cash ? <Field label="Reward budget ID"><input className={inputClass} value={form.budgetId} onChange={(event) => setForm((current) => ({ ...current, budgetId: event.target.value }))} placeholder="Required funded budget" /></Field> : null}
          <Field label="Entitlement expiration (optional)"><input className={inputClass} type="datetime-local" value={form.entitlementExpiresAt} onChange={(event) => setForm((current) => ({ ...current, entitlementExpiresAt: event.target.value }))} /><span className="mt-1 block text-xs text-[var(--muted)]">Leave blank for no entitlement expiration.</span></Field>
          <Field label="Description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(event) => setForm((current) => ({ ...current, prizeDescription: event.target.value }))} /></Field>
          <Field label="Terms"><textarea className={textareaClass} value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} /></Field>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={() => void savePrize()} disabled={busy || invalidForm}>{busy ? "Saving..." : editingId ? "Save Changes" : "Create Prize"}</Button></div>
      </Card>
    </div> : null}

    {viewingPrize ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="view-prize-title">
      <Card className="w-full max-w-xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[var(--gold)]">Prize Definition</p><h2 id="view-prize-title" className="mt-2 text-2xl font-black">{viewingPrize.prizeName}</h2></div><button type="button" onClick={() => setViewingPrize(null)} aria-label="Close Prize details" className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--line)]"><X size={18} /></button></div><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{viewingPrize.prizeDescription || "No description provided."}</p><dl className="mt-6 grid gap-4 rounded-[8px] border border-[var(--line)] p-4 sm:grid-cols-2"><div><dt className="text-xs text-[var(--muted)]">Type</dt><dd className="mt-1 font-bold capitalize">{viewingPrize.prizeType.replaceAll("_", " ")}</dd></div><div><dt className="text-xs text-[var(--muted)]">Status</dt><dd className="mt-1 font-bold capitalize">{viewingPrize.status}</dd></div><div><dt className="text-xs text-[var(--muted)]">Reward value</dt><dd className="mt-1 font-bold">{viewingPrize.rewardValue.toLocaleString()}</dd></div><div><dt className="text-xs text-[var(--muted)]">Availability</dt><dd className="mt-1 font-bold">{availability(viewingPrize)}</dd></div></dl><div className="mt-6 flex justify-end"><Button variant="secondary" onClick={() => setViewingPrize(null)}>Close</Button></div></Card>
    </div> : null}
  </>;
}
