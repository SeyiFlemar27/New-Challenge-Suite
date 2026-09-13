"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, Save, Send, Trash2 } from "lucide-react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const steps = ["Opportunity", "Sponsorship Goal", "Offer & Funding", "Brand Visibility", "Deliverables", "Campaign Creative", "Timeline & Expiry", "Message", "Review"] as const;
const paymentStyles = [
  { value: "one_time", label: "One-time sponsorship" },
  { value: "milestone_payment", label: "Milestone payment" },
  { value: "prize_funding", label: "Prize funding" },
  { value: "product_service", label: "Product/service sponsorship" }
] as const;
type Option = { id: string; title: string; detail: string; available?: boolean; unavailableReason?: string };
type Deliverable = { id: string; title: string; description: string; dueDate: string; required: boolean };
const emptyDeliverable = (index: number): Deliverable => ({ id: `deliverable_${index + 1}`, title: "", description: "", dueDate: "", required: true });
const placementOptions = ["challenge_page", "challenge_card", "sponsor_cta", "results_winners", "challenge_updates", "live_event"] as const;
const initial = { title: "", campaignId: "", creatorId: "", challengeId: "", partnershipType: "challenge_sponsorship", objective: "", proposalScope: "", proposedBudget: "", prizeContribution: "", creatorSponsorship: "", platformFee: "", currency: "USD", startDate: "", endDate: "", expiresAt: "", paymentPreference: "milestone_payment", brandRequirements: "", brandGuidance: "", usageRights: "", cancellationTerms: "", notesToCreator: "", sponsorRole: "supporting", sponsorCategory: "", categoryExclusive: false, requestedPlacements: [] as string[] };

export default function NewSponsorProposalPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...initial, campaignId: search.get("campaignId") ?? "", creatorId: search.get("creatorId") ?? "", challengeId: search.get("challengeId") ?? "" });
  const [deliverables, setDeliverables] = useState<Deliverable[]>([emptyDeliverable(0)]);
  const [creators, setCreators] = useState<Option[]>([]);
  const [challenges, setChallenges] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposalId, setProposalId] = useState(search.get("proposalId") ?? "");
  const [proposalVersion, setProposalVersion] = useState(0);
  const [sent, setSent] = useState(false);
  const lastSavedFingerprint = useRef("");

  useEffect(() => {
    void Promise.all([
      apiRequest<{ creators: Record<string, unknown>[] }>("/api/sponsor/discover/creators"),
      apiRequest<{ challenges: Record<string, unknown>[] }>("/api/sponsor/discover/challenges")
    ]).then(([creatorResult, challengeResult]) => {
      if (creatorResult.ok) setCreators((creatorResult.data?.creators ?? []).map((item) => ({ id: String(item.id), title: String(item.displayName || "Creator"), detail: `${String(item.niche || item.category || "Creator")} / ${String(item.location || "Location not shared")}` })));
      if (challengeResult.ok) setChallenges((challengeResult.data?.challenges ?? []).map((item) => ({ id: String(item.id), title: String(item.title || "Challenge"), detail: `${String(item.category || "Challenge")} / ${friendly(item.status)}`, available: item.sponsorReady !== false, unavailableReason: item.sponsorReady === false ? "This challenge is not accepting sponsors." : undefined })));
    });
  }, []);

  useEffect(() => {
    if (!proposalId || proposalVersion) return;
    void apiRequest<{ proposal: Record<string, unknown> }>(`/api/sponsor/proposals/${proposalId}`).then((result) => {
      const proposal = result.data?.proposal;
      if (!result.ok || !proposal || proposal.status !== "draft") return setNotice(result.message || "This proposal is no longer editable.");
      const centsToAmount = (value: unknown) => Number(value ?? 0) ? (Number(value) / 100).toFixed(2) : "";
      setForm((current) => ({ ...current, title: String(proposal.title ?? ""), campaignId: String(proposal.linkedCampaignId ?? ""), creatorId: String(proposal.linkedCreatorId ?? ""), challengeId: String(proposal.linkedChallengeId ?? ""), partnershipType: String(proposal.partnershipType ?? current.partnershipType), objective: String(proposal.objective ?? ""), proposalScope: String(proposal.proposalScope ?? ""), proposedBudget: centsToAmount(proposal.proposedBudgetCents), prizeContribution: centsToAmount(proposal.prizeContributionCents), creatorSponsorship: centsToAmount(proposal.creatorSponsorshipCents), platformFee: centsToAmount(proposal.platformFeeCents), currency: String(proposal.currency ?? "USD"), startDate: String(proposal.startDate ?? ""), endDate: String(proposal.endDate ?? ""), expiresAt: String(proposal.expiresAt ?? ""), paymentPreference: String(proposal.paymentPreference ?? current.paymentPreference), brandRequirements: String(proposal.brandRequirements ?? ""), usageRights: String(proposal.usageRights ?? ""), cancellationTerms: String(proposal.cancellationTerms ?? ""), notesToCreator: String(proposal.notesToCreator ?? ""), sponsorRole: proposal.sponsorRole === "primary" ? "primary" : "supporting", sponsorCategory: String(proposal.sponsorCategory ?? ""), categoryExclusive: proposal.categoryExclusive === true, requestedPlacements: Array.isArray(proposal.requestedPlacements) ? proposal.requestedPlacements.map(String) : [] }));
      setDeliverables(Array.isArray(proposal.deliverables) && proposal.deliverables.length ? proposal.deliverables as Deliverable[] : [emptyDeliverable(0)]);
      setProposalVersion(Number(proposal.version ?? 1));
      setNotice("Draft restored.");
    });
  }, [proposalId, proposalVersion]);

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setNotice(""); }
  function togglePlacement(value: string) { setForm((current) => ({ ...current, requestedPlacements: current.requestedPlacements.includes(value) ? current.requestedPlacements.filter((item) => item !== value) : [...current.requestedPlacements, value] })); setNotice(""); }
  function updateDeliverable(id: string, field: keyof Deliverable, value: string | boolean) { setDeliverables((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item)); }
  const validDeliverables = useMemo(() => deliverables.filter((item) => item.title.trim()), [deliverables]);
  const allocatedBudget = Number(form.prizeContribution || 0) + Number(form.creatorSponsorship || 0) + Number(form.platformFee || 0);
  const canSend = form.title.trim().length >= 3 && form.objective.trim().length >= 3 && Boolean(form.creatorId || form.challengeId) && Number(form.proposedBudget) > 0 && allocatedBudget <= Number(form.proposedBudget) && validDeliverables.length > 0;
  const payload = useMemo(() => ({ ...form, budget: Number(form.proposedBudget || 0), brandRequirements: [form.brandRequirements, form.brandGuidance].filter(Boolean).join("\n\n"), deliverables: validDeliverables }), [form, validDeliverables]);
  const selectedCreator = creators.find((item) => item.id === form.creatorId);
  const selectedChallenge = challenges.find((item) => item.id === form.challengeId);

  async function persistDraft(navigateAfter = false) {
    if (sent || form.title.trim().length < 3) return null;
    const fingerprint = JSON.stringify(payload);
    if (lastSavedFingerprint.current === fingerprint && proposalId && proposalVersion) {
      if (navigateAfter) router.push(`/sponsor/proposals/${proposalId}`);
      return { id: proposalId, version: proposalVersion };
    }
    setSaving(true);
    const result = proposalId
      ? await apiRequest<{ proposal: { id: string; version: number } }>(`/api/sponsor/proposals/${proposalId}`, { method: "PATCH", body: JSON.stringify({ ...payload, action: "save_draft", expectedVersion: proposalVersion }) })
      : await apiRequest<{ proposal: { id: string; version: number } }>("/api/sponsor/proposals", { method: "POST", body: JSON.stringify({ ...payload, status: "draft" }) });
    setSaving(false);
    if (!result.ok || !result.data?.proposal.id) { setNotice(result.message); return null; }
    const saved = { id: result.data.proposal.id, version: Number(result.data.proposal.version ?? 1) };
    setProposalId(saved.id); setProposalVersion(saved.version); lastSavedFingerprint.current = fingerprint;
    setNotice("Draft saved.");
    if (navigateAfter) router.push(`/sponsor/proposals/${saved.id}`);
    return saved;
  }

  async function sendProposal() {
    if (sent || !canSend) return;
    setSaving(true); setNotice("");
    let active = proposalId && proposalVersion ? { id: proposalId, version: proposalVersion } : null;
    if (!active) {
      const created = await apiRequest<{ proposal: { id: string; version: number } }>("/api/sponsor/proposals", { method: "POST", body: JSON.stringify({ ...payload, status: "draft" }) });
      if (!created.ok || !created.data?.proposal.id) { setSaving(false); setNotice(created.message); return; }
      active = { id: created.data.proposal.id, version: Number(created.data.proposal.version ?? 1) };
    } else if (lastSavedFingerprint.current !== JSON.stringify(payload)) {
      const saved = await apiRequest<{ proposal: { id: string; version: number } }>(`/api/sponsor/proposals/${active.id}`, { method: "PATCH", body: JSON.stringify({ ...payload, action: "save_draft", expectedVersion: active.version }) });
      if (!saved.ok || !saved.data?.proposal.id) { setSaving(false); setNotice(saved.message); return; }
      active = { id: saved.data.proposal.id, version: Number(saved.data.proposal.version) };
    }
    const result = await apiRequest<{ proposal: { id: string } }>(`/api/sponsor/proposals/${active.id}`, { method: "PATCH", body: JSON.stringify({ action: "send", expectedVersion: active.version }) });
    setSaving(false); setNotice(result.message);
    if (result.ok) { setSent(true); router.push(`/sponsor/proposals/${active.id}`); }
  }

  useEffect(() => {
    if (sent || form.title.trim().length < 3 || (proposalId && !proposalVersion)) return;
    const timer = window.setTimeout(() => { void persistDraft(false); }, 900);
    return () => window.clearTimeout(timer);
  }, [payload, proposalId, proposalVersion, sent]);

  return <SponsorShell><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Proposal Builder</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Create a sponsor proposal</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Build a clear proposal using a real creator or challenge opportunity.</p></div><LinkButton href="/sponsor/proposals" variant="secondary">Proposal Center</LinkButton></div>
    <div className="mt-7 grid gap-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start"><aside className="grid gap-2 lg:sticky lg:top-8">{steps.map((item, index) => <button key={item} type="button" onClick={() => setStep(index)} className={`min-h-11 rounded-[8px] border px-3 py-2 text-left text-sm font-bold ${step === index ? "border-amber-400 bg-[var(--gold)] text-black" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"}`}><span className="mr-2 text-xs">{index + 1}.</span>{item}</button>)}</aside>
      <Card className="p-5 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Step {step + 1} of {steps.length}</p><h2 className="mt-2 text-2xl font-black text-slate-950">{steps[step]}</h2><div className="mt-6">
        {step === 0 ? <div className="grid gap-6 md:grid-cols-2"><SearchSelect label="Select creator" value={form.creatorId} onChange={(value) => update("creatorId", value)} options={creators} selected={selectedCreator} empty="No eligible Sponsor-ready creators are available." /><SearchSelect label="Select challenge or opportunity" value={form.challengeId} onChange={(value) => update("challengeId", value)} options={challenges} selected={selectedChallenge} empty="No eligible Sponsor-ready challenges are available." /></div> : null}
        {step === 1 ? <div className="grid gap-5"><Field label="Proposal title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Summer creator partnership" /></Field><Field label="Partnership type"><select className={inputClass} value={form.partnershipType} onChange={(event) => update("partnershipType", event.target.value)}><option value="challenge_sponsorship">Challenge sponsorship</option><option value="creator_partnership">Creator partnership</option><option value="prize_contribution">Prize contribution</option><option value="product_service">Product or service partnership</option></select></Field><Field label="Sponsorship objective"><textarea className={textareaClass} value={form.objective} onChange={(event) => update("objective", event.target.value)} /></Field></div> : null}
        {step === 2 ? <div className="grid gap-5 md:grid-cols-2"><Field label="Total proposed budget"><input className={inputClass} type="number" min="0" step="0.01" value={form.proposedBudget} onChange={(event) => update("proposedBudget", event.target.value)} /></Field><Field label="Currency"><select className={inputClass} value={form.currency} onChange={(event) => update("currency", event.target.value)}><option value="USD">USD</option><option value="NGN">NGN</option><option value="GBP">GBP</option><option value="EUR">EUR</option></select></Field><Field label="Prize contribution"><input className={inputClass} type="number" min="0" step="0.01" value={form.prizeContribution} onChange={(event) => update("prizeContribution", event.target.value)} /></Field><Field label="Creator sponsorship"><input className={inputClass} type="number" min="0" step="0.01" value={form.creatorSponsorship} onChange={(event) => update("creatorSponsorship", event.target.value)} /></Field><Field label="Challenge Suite platform fee"><input className={inputClass} type="number" min="0" step="0.01" value={form.platformFee} onChange={(event) => update("platformFee", event.target.value)} /></Field><Field label="Payment style"><select className={inputClass} value={form.paymentPreference} onChange={(event) => update("paymentPreference", event.target.value)}>{paymentStyles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><p className="md:col-span-2 rounded-[8px] bg-amber-50 p-4 text-sm leading-6 text-amber-900">Prize Contribution is 100% winner-directed. Creator sponsorship and platform fees are separate lines. Sending does not process or reserve funds.</p>{allocatedBudget > Number(form.proposedBudget || 0) ? <p className="md:col-span-2 text-sm font-bold text-red-700">The separate funding lines cannot exceed the total proposed budget.</p> : null}</div> : null}
        {step === 4 ? <DeliverablesEditor deliverables={deliverables} setDeliverables={setDeliverables} updateDeliverable={updateDeliverable} /> : null}
        {step === 3 ? <div className="grid gap-5 md:grid-cols-2"><Field label="Sponsor position"><select className={inputClass} value={form.sponsorRole} onChange={(event) => update("sponsorRole", event.target.value)}><option value="supporting">Supporting Sponsor</option><option value="primary">Primary Sponsor</option></select></Field><Field label="Sponsor category"><input className={inputClass} value={form.sponsorCategory} onChange={(event) => update("sponsorCategory", event.target.value)} placeholder="For example, sportswear" /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={form.categoryExclusive} onChange={(event) => setForm((current) => ({ ...current, categoryExclusive: event.target.checked }))} /> Request category exclusivity</label><div className="md:col-span-2"><p className="text-sm font-bold text-slate-800">Requested placements</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{placementOptions.map((item) => <label key={item} className="flex min-h-11 items-center gap-3 rounded-[8px] border border-slate-200 p-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.requestedPlacements.includes(item)} onChange={() => togglePlacement(item)} /> {friendly(item)}</label>)}</div></div><div className="md:col-span-2"><Field label="Brand requirements"><textarea className={textareaClass} value={form.brandRequirements} onChange={(event) => update("brandRequirements", event.target.value)} /></Field></div><div className="md:col-span-2"><Field label="Do and don't guidance"><textarea className={textareaClass} value={form.brandGuidance} onChange={(event) => update("brandGuidance", event.target.value)} /></Field></div><div className="md:col-span-2"><Field label="Usage rights"><textarea className={textareaClass} value={form.usageRights} onChange={(event) => update("usageRights", event.target.value)} placeholder="Describe channels, duration, territory, and permitted use." /></Field></div></div> : null}
        {step === 5 ? <div className="grid gap-5"><Field label="Campaign creative and scope"><textarea className={textareaClass} value={form.proposalScope} onChange={(event) => update("proposalScope", event.target.value)} placeholder="Describe the creative concept, collaboration scope, and intended outcomes." /></Field></div> : null}
        {step === 6 ? <div className="grid gap-5 md:grid-cols-2"><Field label="Start date"><input className={inputClass} type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} /></Field><Field label="End date"><input className={inputClass} type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></Field><Field label="Proposal expiry"><input className={inputClass} type="date" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></Field><p className="md:col-span-2 rounded-[8px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">Deliverable due dates form the milestone schedule. Funding and release remain inactive until the final revision is accepted and provider eligibility is confirmed.</p></div> : null}
        {step === 7 ? <div className="grid gap-5"><Field label="Message to creator"><textarea className={textareaClass} value={form.notesToCreator} onChange={(event) => update("notesToCreator", event.target.value)} /></Field><Field label="Cancellation and revision terms"><textarea className={textareaClass} value={form.cancellationTerms} onChange={(event) => update("cancellationTerms", event.target.value)} /></Field><p className="rounded-[8px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">Terms remain proposed until both parties accept the same immutable revision. No external payout is activated here.</p></div> : null}
        {step === 8 ? <div className="grid gap-4 sm:grid-cols-2"><Summary label="Recipient" value={selectedCreator?.title || "No creator selected"} /><Summary label="Challenge / opportunity" value={selectedChallenge?.title || "No challenge selected"} /><Summary label="Budget" value={form.proposedBudget ? `${form.currency} ${form.proposedBudget}` : "Required"} /><Summary label="Prize contribution" value={`${form.currency} ${form.prizeContribution || 0}`} /><Summary label="Creator sponsorship" value={`${form.currency} ${form.creatorSponsorship || 0}`} /><Summary label="Platform fee" value={`${form.currency} ${form.platformFee || 0}`} /><Summary label="Sponsor position" value={friendly(form.sponsorRole)} /><Summary label="Category exclusivity" value={form.categoryExclusive ? `Exclusive ${form.sponsorCategory || "category"}` : "Not requested"} /><Summary label="Placements" value={form.requestedPlacements.map(friendly).join(", ") || "No placements requested"} /><Summary label="Dates" value={`${form.startDate || "Start pending"} to ${form.endDate || "End pending"}`} /><Summary label="Deliverables" value={validDeliverables.map((item) => item.title).join(", ") || "Add at least one deliverable"} /><p className="sm:col-span-2 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Sending creates a proposal and immutable first revision only. It does not create a contract, process funding, release money, or launch a sponsorship.</p></div> : null}
      </div>{notice ? <p className="mt-5 rounded-[8px] bg-slate-50 p-3 text-sm font-bold text-slate-700">{notice}</p> : null}<div className="mt-7 flex flex-wrap gap-3">{step > 0 ? <Button variant="secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={16} /> Back</Button> : null}<Button variant="secondary" disabled={saving || sent || form.title.trim().length < 3} onClick={() => void persistDraft(true)}><Save size={16} /> Save & Finish Later</Button>{step < steps.length - 1 ? <Button onClick={() => setStep((current) => current + 1)}>Next <ArrowRight size={16} /></Button> : <Button disabled={saving || sent || !canSend} title={!canSend ? "Complete the title, objective, recipient, budget, and at least one deliverable." : undefined} onClick={() => void sendProposal()}><Send size={16} /> Send Proposal</Button>}<LinkButton href="/sponsor/proposals" variant="ghost">Cancel</LinkButton></div></Card>
    </div></div></SponsorShell>;
}

function SearchSelect({ label, value, onChange, options, selected, empty }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; selected?: Option; empty: string }) {
  const [query, setQuery] = useState("");
  const matches = options.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <Field label={label}><div className="rounded-[8px] border border-slate-200 bg-white p-3">{selected ? <div className="mb-3 flex items-start justify-between gap-3 rounded-[8px] bg-amber-50 p-3"><div><p className="font-black text-slate-950">{selected.title}</p><p className="mt-1 text-xs text-slate-600">{selected.detail}</p></div><button type="button" onClick={() => onChange("")} className="text-xs font-bold text-slate-600">Change</button></div> : null}<input aria-label={`Search ${label.toLowerCase()}`} className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} />{!selected ? <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{matches.length ? matches.map((item) => <button key={item.id} type="button" disabled={item.available === false} title={item.unavailableReason} onClick={() => { onChange(item.id); setQuery(""); }} className="block w-full rounded-[8px] px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="block font-bold text-slate-950">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.unavailableReason || item.detail}</span></button>) : <p className="p-3 text-sm text-slate-500">{empty}</p>}</div> : null}{value && !selected ? <p className="mt-2 text-xs text-amber-800">Selection was prefilled from the previous page and will be validated when the proposal is saved.</p> : null}</div></Field>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div> }
function DeliverablesEditor({ deliverables, setDeliverables, updateDeliverable }: { deliverables: Deliverable[]; setDeliverables: Dispatch<SetStateAction<Deliverable[]>>; updateDeliverable: (id: string, field: keyof Deliverable, value: string | boolean) => void }) {
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-slate-950">Deliverables</h3><p className="mt-1 text-sm text-slate-600">Add clear, reviewable deliverables one at a time.</p></div><Button type="button" variant="secondary" onClick={() => setDeliverables((current) => [...current, emptyDeliverable(current.length)])}><Plus size={16} /> Add Deliverable</Button></div><div className="mt-4 grid gap-4">{deliverables.map((item, index) => <Card key={item.id} className="border-slate-200 bg-slate-50 p-4 shadow-none"><div className="flex items-center justify-between gap-3"><p className="font-black text-slate-950">Deliverable {index + 1}</p>{deliverables.length > 1 ? <button type="button" onClick={() => setDeliverables((current) => current.filter((entry) => entry.id !== item.id))} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-red-700 hover:bg-red-50" aria-label={`Remove deliverable ${index + 1}`}><Trash2 size={16} /></button> : null}</div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Title"><input className={inputClass} value={item.title} onChange={(event) => updateDeliverable(item.id, "title", event.target.value)} /></Field><Field label="Due date (optional)"><input className={inputClass} type="date" value={item.dueDate} onChange={(event) => updateDeliverable(item.id, "dueDate", event.target.value)} /></Field><div className="md:col-span-2"><Field label="Description"><textarea className={textareaClass} value={item.description} onChange={(event) => updateDeliverable(item.id, "description", event.target.value)} /></Field></div><label className="flex min-h-11 items-center gap-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={item.required} onChange={(event) => updateDeliverable(item.id, "required", event.target.checked)} /> Required deliverable</label></div></Card>)}</div></div>;
}
function friendly(value: unknown) { return String(value || "Available").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }
