"use client";
import { useEffect, useRef, useState } from "react";
import { Flag, LifeBuoy, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui";
export function AdminCaseWorkspace({ kind }: { kind: "support" | "disputes" | "appeals" | "safety" }) {
  if (kind === "support") return <AdminSupportWorkspace />;
  return <AdminRecordsWorkspace kind={kind} />;
}

function AdminRecordsWorkspace({ kind }: { kind: "disputes" | "appeals" | "safety" }) {
  const [records, setRecords] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [chargebacks, setChargebacks] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [chargebackNextCursor, setChargebackNextCursor] = useState<string | null>(null);
  const [chargebacksHaveMore, setChargebacksHaveMore] = useState(false);
  const [loadingOlderChargebacks, setLoadingOlderChargebacks] = useState(false);
  const [resolution, setResolution] = useState<{ caseId: string; action: "release_won" | "acknowledge_loss" } | null>(null);
  const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<{ cases: Array<Record<string, unknown> & { id: string }> }>(`/api/admin/cases?kind=${kind}`),
      kind === "disputes" ? apiRequest<{ chargebacks: Array<Record<string, unknown> & { id: string }>; hasMore: boolean; nextCursor: string | null }>("/api/admin/chargebacks?limit=50") : Promise.resolve({ data: { chargebacks: [], hasMore: false, nextCursor: null } })
    ]).then(([casesResult, chargebacksResult]) => {
      if (!active) return;
      if (casesResult.data) setRecords(casesResult.data.cases);
      if (chargebacksResult.data) {
        setChargebacks(chargebacksResult.data.chargebacks);
        setChargebacksHaveMore(chargebacksResult.data.hasMore);
        setChargebackNextCursor(chargebacksResult.data.nextCursor);
      }
    });
    return () => { active = false; };
  }, [kind]);
  async function loadOlderChargebacks() {
    if (!chargebackNextCursor || loadingOlderChargebacks) return;
    setLoadingOlderChargebacks(true);
    const result = await apiRequest<{ chargebacks: Array<Record<string, unknown> & { id: string }>; hasMore: boolean; nextCursor: string | null }>(`/api/admin/chargebacks?limit=50&cursor=${encodeURIComponent(chargebackNextCursor)}`);
    if (result.data) {
      setChargebacks((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...result.data!.chargebacks.filter((item) => !existingIds.has(item.id))];
      });
      setChargebacksHaveMore(result.data.hasMore);
      setChargebackNextCursor(result.data.nextCursor);
    } else setNotice(result.message);
    setLoadingOlderChargebacks(false);
  }
  async function reconcile() {
    if (!resolution || !confirmed || reason.trim().length < 10) return;
    setBusy(true);
    const result = await apiRequest("/api/admin/chargebacks", { method: "PATCH", body: JSON.stringify({ caseId: resolution.caseId, action: resolution.action, reason: reason.trim(), confirmed }) });
    setNotice(result.message); setBusy(false);
    if (result.ok) { setResolution(null); setReason(""); setConfirmed(false); const fresh = await apiRequest<{ chargebacks: Array<Record<string, unknown> & { id: string }>; hasMore: boolean; nextCursor: string | null }>("/api/admin/chargebacks?limit=50"); if (fresh.data) { setChargebacks(fresh.data.chargebacks); setChargebacksHaveMore(fresh.data.hasMore); setChargebackNextCursor(fresh.data.nextCursor); } }
  }
  const title = kind === "disputes" ? "Formal Disputes" : kind === "appeals" ? "Appeals" : "Safety Reports";
  return <><PageTitle title={title} subtitle="A separate permission-controlled workspace backed by real case records." icon={kind === "safety" ? <ShieldAlert className="text-[var(--gold)]" /> : <Flag className="text-[var(--gold)]" />} />{notice ? <p role="status" className="mt-4 text-sm">{notice}</p> : null}{kind === "disputes" && chargebacks.length ? <section className="mt-6"><h2 className="mb-3 text-lg font-black">Stripe funding disputes</h2><div className="grid gap-4 md:grid-cols-2">{chargebacks.map((item) => <Card key={item.id} className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">{String(item.providerStatus ?? item.status ?? "received").replaceAll("_", " ")} · {String(item.adminReconciliationStatus ?? "reconciliation required").replaceAll("_", " ")}</p><h3 className="mt-2 font-black">{String(item.challengeId ?? "Unlinked challenge")}</h3><p className="mt-2 text-sm text-slate-400">Disputed {String(item.amountCents ?? 0)} {String(item.currency ?? "").toUpperCase()} · contribution {String(item.contributionId ?? "unlinked")}</p><p className="mt-2 text-xs text-slate-500">{String(item.linkStatus ?? "unverified link")} · Stripe dispute {String(item.stripeDisputeId ?? "unavailable")}</p>{item.linkStatus === "verified" && item.providerOutcome === "won" && item.restrictionActive === true ? <Button className="mt-4" onClick={() => { setResolution({ caseId: item.id, action: "release_won" }); setReason(""); setConfirmed(false); }}>Review and release hold</Button> : null}{item.providerOutcome === "lost" && item.adminReconciliationStatus !== "loss_acknowledged_hold_remains" ? <Button variant="secondary" className="mt-4" onClick={() => { setResolution({ caseId: item.id, action: "acknowledge_loss" }); setReason(""); setConfirmed(false); }}>Acknowledge loss, keep hold</Button> : null}</Card>)}</div>{chargebacksHaveMore ? <Button variant="secondary" className="mt-4" onClick={() => void loadOlderChargebacks()} disabled={loadingOlderChargebacks}>{loadingOlderChargebacks ? "Loading older disputes…" : "Load older disputes"}</Button> : null}</section> : null}<div className="mt-6 grid gap-4 md:grid-cols-2">{records.map((record) => <Card key={record.id} className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">{String(record.status ?? "submitted").replaceAll("_", " ")}</p><h2 className="mt-2 text-lg font-black">{String(record.subject ?? record.title ?? record.type ?? record.id)}</h2><p className="mt-3 text-sm text-slate-400">{String(record.reason ?? record.description ?? "Review the linked source record and activity history.")}</p></Card>)}{!records.length ? <Card className="md:col-span-2"><EmptyState icon={<Flag />} title={`No ${title.toLowerCase()}`} body="No synthetic cases or conversations are displayed." /></Card> : null}</div>{resolution ? <div role="dialog" aria-modal="true" aria-labelledby="stripe-dispute-reconciliation" className="fixed inset-0 z-[130] grid place-items-center bg-black/70 p-4"><Card className="w-full max-w-lg p-6"><h2 id="stripe-dispute-reconciliation" className="text-xl font-black">{resolution.action === "release_won" ? "Release a won-dispute hold" : "Record lost-dispute review"}</h2><p className="mt-3 text-sm text-slate-400">{resolution.action === "release_won" ? "The server rechecks Stripe’s current final status and other financial restrictions. Completed payouts remain unchanged." : "This records Admin review only. The financial restriction remains in place; no replacement funding or debit is created."}</p><label className="mt-4 block text-sm font-bold">Required reason<textarea className="mt-2 min-h-24 w-full rounded-[8px] border border-white/10 bg-black/30 p-3" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1200} /></label><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the provider outcome and confirm this Admin reconciliation.</span></label><div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setResolution(null)} disabled={busy}>Cancel</Button><Button onClick={() => void reconcile()} disabled={busy || !confirmed || reason.trim().length < 10}>Confirm reconciliation</Button></div></Card></div> : null}</>;
}

function AdminSupportWorkspace() {
  type Ticket = Record<string, unknown> & { id: string };
  const [tickets, setTickets] = useState<Ticket[]>([]); const [selected, setSelected] = useState<Ticket | null>(null); const [messages, setMessages] = useState<Ticket[]>([]); const [reply, setReply] = useState(""); const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const replyIdempotencyKey = useRef<string | null>(null);
  async function loadTickets() { const result = await apiRequest<{ cases: Ticket[] }>("/api/admin/cases?kind=support"); if (result.data) setTickets(result.data.cases); }
  async function loadTicket(id: string) { const result = await apiRequest<{ ticket: Ticket; messages: Ticket[] }>(`/api/admin/support/tickets/${encodeURIComponent(id)}`); if (result.data) { setSelected(result.data.ticket); setMessages(result.data.messages); } else setNotice(result.message); }
  useEffect(() => {
    let active = true;
    apiRequest<{ cases: Ticket[] }>("/api/admin/cases?kind=support").then((result) => {
      if (active && result.data) setTickets(result.data.cases);
    });
    return () => { active = false; };
  }, []);
  async function decide(action: string) {
    if (!selected || !confirmed || reason.trim().length < 8) return;
    setBusy(true); const result = await apiRequest<{ status?: string }>("/api/admin/cases", { method: "PATCH", body: JSON.stringify({ kind: "support", caseId: selected.id, action, reason }) });
    setNotice(result.message); setConfirmed(false); setBusy(false); if (result.ok) { await loadTickets(); await loadTicket(selected.id); }
  }
  async function sendReply() {
    if (!selected || !confirmed || reason.trim().length < 8 || !reply.trim()) return;
    replyIdempotencyKey.current ??= crypto.randomUUID();
    setBusy(true); const result = await apiRequest<{ emailDeliveryStatus?: string }>(`/api/admin/support/tickets/${encodeURIComponent(selected.id)}/messages`, { method: "POST", headers: { "idempotency-key": replyIdempotencyKey.current }, body: JSON.stringify({ message: reply, reason, confirmed }) });
    setNotice(result.message); setBusy(false); if (result.ok && result.data?.emailDeliveryStatus === "sent") { setReply(""); setConfirmed(false); replyIdempotencyKey.current = null; await loadTickets(); await loadTicket(selected.id); }
  }
  return <><PageTitle title="Support Tickets" subtitle="Review the user’s ticket, reply by email, and record reasoned decisions." icon={<LifeBuoy className="text-[var(--gold)]" />} />{notice ? <p className="mt-4 text-sm" role="status">{notice}</p> : null}<div className="mt-6 grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]"><div className="grid content-start gap-3">{tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => void loadTicket(ticket.id)} className={`rounded-[8px] border p-4 text-left ${selected?.id === ticket.id ? "border-[var(--gold)] bg-white/5" : "border-white/10"}`}><p className="text-xs font-black uppercase text-[var(--gold)]">{String(ticket.ticketNumber ?? ticket.id)} · {String(ticket.status ?? "submitted").replaceAll("_", " ")}</p><p className="mt-2 font-black">{String(ticket.subject ?? "Support request")}</p><p className="mt-1 text-xs text-slate-400">{String(ticket.userEmail ?? ticket.userId ?? "User")}</p></button>)}{!tickets.length ? <Card><EmptyState icon={<LifeBuoy />} title="No support tickets" body="New user tickets will appear here." /></Card> : null}</div>{selected ? <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[var(--gold)]">{String(selected.ticketNumber ?? selected.id)} · {String(selected.status ?? "submitted").replaceAll("_", " ")}</p><h2 className="mt-2 text-xl font-black">{String(selected.subject ?? "Support request")}</h2></div><span className="text-sm text-slate-400">{String(selected.userEmail ?? selected.userId)}</span></div><p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{String(selected.description ?? "")}</p>{Array.isArray(selected.attachmentPaths) && selected.attachmentPaths.length ? <div className="mt-3 flex flex-wrap gap-3">{selected.attachmentPaths.map((path, index) => <a key={String(path)} className="text-sm font-bold text-[var(--gold)] underline" target="_blank" rel="noreferrer" href={`/api/support/tickets/${encodeURIComponent(selected.id)}/attachments?path=${encodeURIComponent(String(path))}`}>Attachment {index + 1}</a>)}</div> : null}<div className="mt-5 max-h-80 space-y-3 overflow-y-auto rounded-[8px] border border-white/10 p-4">{messages.map((message) => <div key={message.id} className="rounded-[8px] bg-white/5 p-3"><p className="text-xs font-bold uppercase text-[var(--gold)]">{String(message.authorType ?? "reply")} · {String(message.createdAt ?? "")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{String(message.body ?? "")}</p></div>)}</div><label className="mt-5 block text-sm font-bold">Admin reply<textarea className="mt-2 min-h-28 w-full rounded-[8px] border border-white/10 bg-black/30 p-3" value={reply} onChange={(event) => { if (event.target.value !== reply) replyIdempotencyKey.current = null; setReply(event.target.value); }} maxLength={5000} /></label><label className="mt-4 block text-sm font-bold">Reason for action<textarea className="mt-2 min-h-20 w-full rounded-[8px] border border-white/10 bg-black/30 p-3" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed this ticket and confirm the selected action.</span></label><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void sendReply()} disabled={busy || !confirmed || reason.trim().length < 8 || !reply.trim()}>Send reply by email</Button><Button variant="secondary" onClick={() => void decide("start")} disabled={busy || !confirmed || reason.trim().length < 8}>Start review</Button><Button variant="secondary" onClick={() => void decide("resolve")} disabled={busy || !confirmed || reason.trim().length < 8}>Resolve</Button><Button variant="secondary" onClick={() => void decide("close")} disabled={busy || !confirmed || reason.trim().length < 8}>Close</Button><Button variant="secondary" onClick={() => void decide("reopen")} disabled={busy || !confirmed || reason.trim().length < 8}>Reopen</Button></div></Card> : <Card><EmptyState icon={<LifeBuoy />} title="Select a ticket" body="Ticket details and replies are visible to authorized Admins." /></Card>}</div></>;
}
