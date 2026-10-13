"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { SUPPORT_CATEGORIES, SUPPORT_ISSUE_CONDITIONS } from "@/lib/support/catalog";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui";

type RecordValue = Record<string, unknown>;
type Ticket = RecordValue & { id: string };
type Issue = RecordValue & { id: string; condition: string; updatedAt?: string };
type Message = RecordValue & { id: string };
type TicketDetail = { ticket: Ticket; messages: Message[]; issues: Issue[]; staffNotes: Message[]; emailOutboxes: Array<{ id: string; type: string; status: string; attempts: number; lastError?: string | null }> };
const categoryPairs = Object.entries(SUPPORT_CATEGORIES);

export function AdminSupportWorkspace() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [reply, setReply] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [newIssue, setNewIssue] = useState({ category: "other", issueType: "other", title: "", customerDescription: "" });
  const [issueExplanations, setIssueExplanations] = useState<Record<string, string>>({});
  const [issueAuditIds, setIssueAuditIds] = useState<Record<string, string>>({});
  const [issueConditions, setIssueConditions] = useState<Record<string, string>>({});
  const replyIdempotencyKey = useRef<string | null>(null);

  const loadTickets = useCallback(async () => {
    const result = await apiRequest<{ cases: Ticket[] }>("/api/admin/cases?kind=support");
    if (result.data) setTickets(result.data.cases);
    else setNotice(result.message);
  }, []);

  const loadTicket = useCallback(async (id: string) => {
    const result = await apiRequest<TicketDetail>(`/api/admin/support/tickets/${encodeURIComponent(id)}`);
    if (result.data) setSelected(result.data);
    else setNotice(result.message);
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<{ cases: Ticket[] }>("/api/admin/cases?kind=support").then((result) => {
      if (!active) return;
      if (result.data) setTickets(result.data.cases);
      else setNotice(result.message);
    }).catch(() => {
      if (active) setNotice("Support tickets could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!selected || !confirmed || reason.trim().length < 8) return;
    setBusy(true);
    const result = await apiRequest<{ status?: string }>("/api/admin/cases", { method: "PATCH", body: JSON.stringify({ kind: "support", caseId: selected.ticket.id, action, reason: reason.trim(), confirmed: true, ...extra }) });
    setNotice(result.message);
    setBusy(false);
    if (result.ok) { setConfirmed(false); setReason(""); setCustomerMessage(""); setResolutionSummary(""); await loadTickets(); await loadTicket(selected.ticket.id); }
  }

  async function sendReply() {
    if (!selected || !confirmed || reason.trim().length < 8 || !reply.trim()) return;
    replyIdempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    const result = await apiRequest<{ emailDeliveryStatus?: string }>(`/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}/messages`, { method: "POST", headers: { "idempotency-key": replyIdempotencyKey.current }, body: JSON.stringify({ message: reply.trim(), reason: reason.trim(), confirmed: true }) });
    setNotice(result.message);
    setBusy(false);
    if (result.ok) { setReply(""); replyIdempotencyKey.current = null; setConfirmed(false); setReason(""); await loadTickets(); await loadTicket(selected.ticket.id); }
  }

  async function addIssue() {
    if (!selected || !confirmed || reason.trim().length < 8 || newIssue.title.trim().length < 5) return;
    setBusy(true);
    const result = await apiRequest<{ issueId: string }>(`/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}`, { method: "POST", body: JSON.stringify({ ...newIssue, reason: reason.trim(), confirmed: true }) });
    setNotice(result.message); setBusy(false);
    if (result.ok) { setNewIssue({ ...newIssue, title: "", customerDescription: "" }); setConfirmed(false); setReason(""); await loadTicket(selected.ticket.id); }
  }

  async function updateIssue(issue: Issue) {
    if (!selected || !confirmed || reason.trim().length < 8) return;
    const condition = issueConditions[issue.id] ?? issue.condition;
    setBusy(true);
    const result = await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}`, { method: "PATCH", body: JSON.stringify({ issueId: issue.id, condition, customerExplanation: issueExplanations[issue.id] ?? issue.customerExplanation ?? "", verifiedAuditId: issueAuditIds[issue.id] ?? issue.verifiedAuditId ?? "", expectedUpdatedAt: issue.updatedAt, reason: reason.trim(), confirmed: true }) });
    setNotice(result.message); setBusy(false);
    if (result.ok) { setConfirmed(false); setReason(""); await loadTicket(selected.ticket.id); }
  }

  async function confirmPrimaryIssue(issue: Issue) {
    if (!selected || !confirmed || reason.trim().length < 8) return;
    setBusy(true);
    const result = await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}/primary`, {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ issueId: issue.id, reason: reason.trim(), confirmed: true, expectedVersion: Number(selected.ticket.version ?? 0) })
    });
    setNotice(result.message);
    setBusy(false);
    if (result.ok) { setConfirmed(false); setReason(""); await loadTickets(); await loadTicket(selected.ticket.id); }
  }

  async function addInternalNote() {
    if (!staffNote.trim()) return;
    const note = staffNote.trim(); setStaffNote("");
    await act("add_note", { note });
  }

  async function retryEmail(outboxId: string) {
    if (!selected || !confirmed || reason.trim().length < 8) return;
    setBusy(true);
    const result = await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}/email-retry`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ outboxId, reason: reason.trim(), confirmed: true }) });
    setNotice(result.message); setBusy(false);
    if (result.ok) { setConfirmed(false); setReason(""); await loadTicket(selected.ticket.id); }
  }

  const ticket = selected?.ticket;
  const readOnly = ticket?.status === "closed";
  const issuesConcluded = Boolean(selected?.issues.length) && selected!.issues.every((issue) => issue.condition === "fixed" || issue.condition === "explained");
  return <>
    <PageTitle title="Support Tickets" subtitle="Review issue history, provide customer-facing updates, and record auditable outcomes." icon={<LifeBuoy className="text-[var(--gold)]" />} />
    {notice ? <p role="status" className="mt-4 text-sm">{notice}</p> : null}
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
      <div className="grid content-start gap-3">{tickets.map((item) => <button key={item.id} type="button" onClick={() => void loadTicket(item.id)} className={`rounded border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)] ${ticket?.id === item.id ? "border-[var(--gold)] bg-white/5" : "border-white/10"}`}><p className="text-xs font-black uppercase text-[var(--gold)]">{String(item.ticketNumber ?? item.id)} · {String(item.status ?? "open").replaceAll("_", " ")}</p><p className="mt-2 font-black">{String(item.subject ?? "Support request")}</p><p className="mt-1 text-xs text-slate-400">{String(item.contactEmail ?? item.userEmail ?? "Customer")}</p></button>)}{!tickets.length ? <Card><EmptyState icon={<LifeBuoy />} title="No support tickets" body="Customer requests appear here after submission." /></Card> : null}</div>
      {selected ? <Card className="space-y-5 p-5">
        <header><p className="text-xs font-black uppercase text-[var(--gold)]">{String(ticket?.ticketNumber ?? ticket?.id)} · {String(ticket?.status ?? "open").replaceAll("_", " ")} · {String(ticket?.priority ?? "normal")}</p><h2 className="mt-2 text-xl font-black">{String(ticket?.subject ?? "Support request")}</h2><p className="mt-1 text-sm text-slate-400">{String(ticket?.contactEmail ?? ticket?.userEmail ?? ticket?.userId ?? "Customer")}</p><p className="mt-4 whitespace-pre-wrap text-sm">{String(ticket?.description ?? "")}</p><p className="mt-3 text-xs text-slate-500">{String(ticket?.category ?? "other").replaceAll("_", " ")} · {String(ticket?.issueType ?? "other").replaceAll("_", " ")}</p></header>
        <section aria-labelledby="support-issues-heading"><h3 id="support-issues-heading" className="font-black">Tracked issues</h3><p className="mt-1 text-xs text-slate-400">AI recommendations are unavailable until a provider is approved. Select and confirm the primary complaint manually; this is recorded in the audit history.</p><div className="mt-3 space-y-3">{selected.issues.map((issue) => <div key={issue.id} className="rounded border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{String(issue.title ?? issue.issueType ?? "Issue")}</p><p className="text-xs text-slate-400">{String(issue.category ?? "").replaceAll("_", " ")} · {String(issue.issueType ?? "").replaceAll("_", " ")}{issue.primary === true ? " · Admin-confirmed primary" : ""}</p></div><span className="text-xs font-bold uppercase text-[var(--gold)]">{String(issue.condition ?? "investigating").replaceAll("_", " ")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{String(issue.customerDescription ?? "")}</p>{!readOnly && issue.primary !== true ? <Button variant="secondary" className="mt-3" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void confirmPrimaryIssue(issue)}>Confirm as primary issue</Button> : null}{issue.condition !== "fixed" && issue.condition !== "explained" && !readOnly ? <div className="mt-3 space-y-3"><label className="block text-xs font-bold">Issue outcome<select value={issueConditions[issue.id] ?? String(issue.condition ?? "investigating")} onChange={(event) => setIssueConditions((value) => ({ ...value, [issue.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded border border-white/10 bg-black/20 px-2">{SUPPORT_ISSUE_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition.replaceAll("_", " ")}</option>)}</select></label><label className="block text-xs font-bold">Customer-visible explanation<textarea value={issueExplanations[issue.id] ?? String(issue.customerExplanation ?? "")} onChange={(event) => setIssueExplanations((value) => ({ ...value, [issue.id]: event.target.value }))} maxLength={5000} rows={3} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2" /></label>{(issueConditions[issue.id] ?? issue.condition) === "fixed" ? <label className="block text-xs font-bold">Verified successful Admin operation audit ID<input value={issueAuditIds[issue.id] ?? ""} onChange={(event) => setIssueAuditIds((value) => ({ ...value, [issue.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded border border-white/10 bg-black/20 px-2" /></label> : null}<Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void updateIssue(issue)}>Save issue outcome</Button></div> : issue.customerExplanation ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{String(issue.customerExplanation)}</p> : null}</div>)}</div>
          {!readOnly ? <div className="mt-4 rounded border border-dashed border-white/15 p-4"><h4 className="font-bold">Add related issue</h4><label className="mt-3 block text-xs font-bold">Category<select value={newIssue.category} onChange={(event) => { const category = event.target.value; const first = SUPPORT_CATEGORIES[category as keyof typeof SUPPORT_CATEGORIES].issueTypes[0]; setNewIssue((current) => ({ ...current, category, issueType: first })); }} className="mt-1 min-h-10 w-full rounded border border-white/10 bg-black/20 px-2">{categoryPairs.map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}</select></label><label className="mt-3 block text-xs font-bold">Issue type<select value={newIssue.issueType} onChange={(event) => setNewIssue((current) => ({ ...current, issueType: event.target.value }))} className="mt-1 min-h-10 w-full rounded border border-white/10 bg-black/20 px-2">{SUPPORT_CATEGORIES[newIssue.category as keyof typeof SUPPORT_CATEGORIES].issueTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label className="mt-3 block text-xs font-bold">Issue title<input value={newIssue.title} onChange={(event) => setNewIssue((current) => ({ ...current, title: event.target.value }))} maxLength={180} className="mt-1 min-h-10 w-full rounded border border-white/10 bg-black/20 px-2" /></label><label className="mt-3 block text-xs font-bold">Customer-visible description<textarea value={newIssue.customerDescription} onChange={(event) => setNewIssue((current) => ({ ...current, customerDescription: event.target.value }))} maxLength={5000} rows={3} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2" /></label><Button variant="secondary" className="mt-3" disabled={busy || !confirmed || reason.trim().length < 8 || newIssue.title.trim().length < 5} onClick={() => void addIssue()}>Add issue</Button></div> : null}
        </section>
        <section aria-labelledby="support-conversation-heading"><h3 id="support-conversation-heading" className="font-black">Conversation</h3><div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded border border-white/10 p-3">{selected.messages.map((message) => <div key={message.id} className={`rounded p-3 ${message.visibility === "internal" || message.internalOnly === true ? "border border-amber-400/30 bg-amber-400/5" : "bg-white/5"}`}><p className="text-xs font-bold uppercase text-[var(--gold)]">{message.visibility === "internal" || message.internalOnly === true ? "Internal note" : String(message.authorType ?? "message")} · {String(message.createdAt ?? "")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{String(message.body ?? "")}</p>{Array.isArray(message.attachmentPaths) ? <div className="mt-2 flex flex-wrap gap-3">{message.attachmentPaths.map((path) => <a key={String(path)} href={`/api/support/tickets/${encodeURIComponent(selected.ticket.id)}/attachments?path=${encodeURIComponent(String(path))}`} className="text-xs font-bold text-[var(--gold)] underline">{String(path).split("/").at(-1)}</a>)}</div> : null}</div>)}</div></section>
        {selected.staffNotes.length ? <section><h3 className="font-black">Admin-only notes</h3>{selected.staffNotes.map((note) => <p key={note.id} className="mt-2 whitespace-pre-wrap rounded border border-amber-400/20 bg-amber-400/5 p-3 text-sm">{String(note.body ?? "")}</p>)}</section> : null}
        {selected.emailOutboxes.length ? <section><h3 className="font-black">Email delivery records</h3><div className="mt-2 space-y-2">{selected.emailOutboxes.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 p-3"><div><p className="text-sm font-bold">{String(item.type).replaceAll("_", " ")}</p><p className="text-xs text-slate-400">{String(item.status).replaceAll("_", " ")} · {item.attempts} attempts{item.lastError ? ` · ${item.lastError}` : ""}</p></div>{item.status !== "sent" && !readOnly ? <Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void retryEmail(item.id)}>Retry email</Button> : null}</div>)}</div><p className="mt-2 text-xs text-slate-400">Retries use the original provider idempotency key. Delivery remains disabled until the approved mail provider is configured.</p></section> : null}
        {!readOnly ? <>
          <section className="space-y-3"><h3 className="font-black">Customer response</h3><label className="block text-sm font-bold">Reply<textarea value={reply} onChange={(event) => { if (event.target.value !== reply) replyIdempotencyKey.current = null; setReply(event.target.value); }} maxLength={10_000} rows={4} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-3" /></label><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8 || !reply.trim()} onClick={() => void sendReply()}>Save reply and queue email</Button><p className="text-xs text-slate-400">Email delivery remains disabled until the approved provider configuration is enabled. Replies are still saved in the ticket.</p></section>
          <section className="space-y-3"><h3 className="font-black">Workflow</h3>{ticket?.status !== "resolved" ? <><label className="block text-sm font-bold">Question for customer<textarea value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} maxLength={5000} rows={3} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-3" /></label><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void act("start")}>Start review</Button><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8 || customerMessage.trim().length < 10} onClick={() => void act("wait_user", { customerMessage: customerMessage.trim() })}>Request information</Button><Button disabled={busy || !confirmed || reason.trim().length < 8 || resolutionSummary.trim().length < 10 || !issuesConcluded} onClick={() => void act("resolve", { resolutionSummary: resolutionSummary.trim() })}>Resolve ticket</Button></div><label className="block text-sm font-bold">Final customer-visible resolution summary<textarea value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} maxLength={5000} rows={4} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-3" /></label>{!issuesConcluded ? <p className="text-xs text-slate-400">Resolve or explain every tracked issue before resolving the request.</p> : null}</> : <><p className="text-sm text-slate-400">The request is resolved. It remains replyable by the customer during the seven-day reopen window.</p><label className="block text-sm font-bold">Early closure message<textarea value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} maxLength={5000} rows={3} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-3" /></label><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8 || customerMessage.trim().length < 10} onClick={() => void act("close", { customerMessage: customerMessage.trim() })}>Close resolved ticket with notice</Button></>}</section>
          <section className="space-y-2"><h3 className="font-black">Internal note</h3><textarea value={staffNote} onChange={(event) => setStaffNote(event.target.value)} maxLength={3000} rows={2} className="w-full rounded border border-white/10 bg-black/20 p-3" /><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8 || !staffNote.trim()} onClick={() => void addInternalNote()}>Save Admin-only note</Button></section>
          <section className="rounded border border-white/10 p-4"><p className="text-sm font-black">Support assistant</p><p className="mt-1 text-sm text-slate-400">AI assistance is not configured. No automated diagnosis or customer reply will be generated.</p></section>
        </> : <p className="rounded border border-white/10 p-3 text-sm text-slate-400">This ticket is closed and read-only.</p>}
        {!readOnly ? <section className="border-t border-white/10 pt-4"><label className="block text-sm font-bold">Required Admin reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-3" /></label><label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the ticket and confirm this action.</span></label></section> : null}
      </Card> : <Card><EmptyState icon={<LifeBuoy />} title="Select a ticket" body="Ticket details and internal notes are restricted to authorized Admins." /></Card>}
    </div>
  </>;
}
