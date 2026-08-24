"use client";

import { useEffect, useMemo, useState } from "react";
import { Handshake, Send } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button, Card, EmptyState, Field, inputClass, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Deliverable = { id: string; title?: string; description?: string; status?: string; sponsorFeedback?: string; version?: number };
type Proposal = { id: string; title?: string; status?: string };

export default function CreatorSponsorshipsPage() {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [focus, setFocus] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [deliverableResult, proposalResult] = await Promise.all([
      apiRequest<{ deliverables: Deliverable[] }>("/api/creator/sponsorship-deliverables"),
      apiRequest<{ proposals: Proposal[] }>("/api/creator/sponsorship-proposals")
    ]);
    if (deliverableResult.ok) setDeliverables(deliverableResult.data?.deliverables ?? []);
    if (proposalResult.ok) setProposals(proposalResult.data?.proposals ?? []);
    setMessage(deliverableResult.ok && proposalResult.ok ? "" : deliverableResult.message || proposalResult.message);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  const selected = useMemo(() => deliverables.find((item) => item.id === focus), [deliverables, focus]);

  async function submit() {
    if (!selected) return;
    const result = await apiRequest(`/api/creator/sponsorship-deliverables/${selected.id}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: selected.version, submissionNote: note, uploadedFiles: files.split(",").map((item) => item.trim()).filter(Boolean) }) });
    setMessage(result.message);
    if (result.ok) { setFocus(""); setNote(""); setFiles(""); await load(); }
  }

  return <>
    <Sidebar />
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator Sponsorships</p><h1 className="mt-3 text-4xl font-black">Sponsorship work</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Review real proposals and submit the deliverables attached to funded sponsorships.</p></div>
      {message ? <Card className="mt-6 p-4 text-sm text-slate-700">{message}</Card> : null}
      {loading ? <Card className="mt-8 h-64 animate-pulse bg-slate-100" /> : <div className="mt-8 grid gap-8 xl:grid-cols-[.8fr_1.2fr]">
        <section><h2 className="text-xl font-black">Proposals</h2><div className="mt-4 grid gap-3">{proposals.map((proposal) => <Card key={proposal.id} className="p-4"><p className="font-black">{proposal.title || "Sponsorship proposal"}</p><p className="mt-1 text-sm capitalize text-slate-500">{String(proposal.status || "sent").replaceAll("_", " ")}</p></Card>)}{!proposals.length ? <EmptyState icon={<Handshake />} title="No sponsor proposals yet." body="Sponsor proposals connected to your account will appear here." /> : null}</div></section>
        <section><h2 className="text-xl font-black">Deliverables</h2><div className="mt-4 grid gap-4">{deliverables.map((item) => <Card key={item.id} id={item.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase text-[var(--gold)]">{String(item.status || "not_started").replaceAll("_", " ")}</p><h3 className="mt-2 text-xl font-black">{item.title}</h3><p className="mt-2 text-sm text-slate-600">{item.description || "No additional description."}</p>{item.sponsorFeedback ? <p className="mt-3 rounded-[8px] bg-amber-50 p-3 text-sm text-amber-900">Sponsor feedback: {item.sponsorFeedback}</p> : null}</div>{["not_started", "in_progress", "changes_requested"].includes(String(item.status)) ? <Button variant="secondary" onClick={() => setFocus(item.id)}>Submit Work</Button> : null}</div>{focus === item.id ? <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5"><Field label="Submission note"><textarea className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the completed work and what the sponsor should review." /></Field><Field label="Confirmed file links (optional, comma separated)"><input className={inputClass} value={files} onChange={(event) => setFiles(event.target.value)} placeholder="https://..." /></Field><div className="flex gap-3"><Button onClick={() => void submit()} disabled={note.trim().length < 3 && !files.trim()}><Send size={16} /> Submit for Review</Button><Button variant="ghost" onClick={() => setFocus("")}>Cancel</Button></div></div> : null}</Card>)}{!deliverables.length ? <EmptyState icon={<Handshake />} title="No sponsorship deliverables yet." body="Deliverables appear here after an accepted proposal is fully funded." /> : null}</div></section>
      </div>}
    </main>
  </>;
}
