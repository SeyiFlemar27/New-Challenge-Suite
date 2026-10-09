"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { LifeBuoy } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
export default function Page() {
  type Ticket = Record<string, unknown> & { id: string };
  const [tickets, setTickets] = useState<Ticket[]>([]); const [selected, setSelected] = useState<Ticket | null>(null); const [messages, setMessages] = useState<Ticket[]>([]); const [reply, setReply] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { const result = await apiRequest<{ tickets: Ticket[] }>("/api/support/tickets"); if (result.data) setTickets(result.data.tickets); else setNotice(result.message); }
  useEffect(() => {
    let active = true;
    apiRequest<{ tickets: Ticket[] }>("/api/support/tickets").then((result) => {
      if (!active) return;
      if (result.data) setTickets(result.data.tickets);
      else setNotice(result.message);
    });
    return () => { active = false; };
  }, []);
  async function open(ticket: Ticket) { const result = await apiRequest<{ ticket: Ticket; messages: Ticket[] }>(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`); if (result.data) { setSelected(result.data.ticket); setMessages(result.data.messages); setNotice(""); } else setNotice(result.message); }
  async function sendReply() { if (!selected || !reply.trim()) return; setBusy(true); const result = await apiRequest("/api/support/tickets/" + encodeURIComponent(selected.id) + "/messages", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ message: reply }) }); setNotice(result.message); setBusy(false); if (result.ok) { setReply(""); await load(); await open(selected); } }
  return <AppShell><PageTitle title="My Support Tickets" subtitle="Follow replies and continue or reopen a ticket within seven days of resolution." icon={<LifeBuoy className="text-[var(--gold)]" />} />{notice ? <p className="mt-4 text-sm" role="status">{notice}</p> : null}<div className="mt-7 grid gap-4 xl:grid-cols-2">{tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => void open(ticket)} className="text-left"><Card className={`h-full p-5 ${selected?.id === ticket.id ? "border-[var(--gold)]" : ""}`}><p className="text-xs font-black uppercase text-[var(--gold)]">{String(ticket.ticketNumber ?? ticket.id)} · {String(ticket.status ?? "submitted").replaceAll("_", " ")}</p><h2 className="mt-2 text-lg font-black">{String(ticket.subject)}</h2><p className="mt-3 text-sm text-slate-400">{String(ticket.category).replaceAll("_", " ")}</p></Card></button>)}{!tickets.length ? <Card className="md:col-span-2"><EmptyState icon={<LifeBuoy />} title="No support tickets" body="Your support tickets will appear here." /><LinkButton href="/support/new" className="mt-5">Create Ticket</LinkButton></Card> : null}</div>{selected ? <Card className="mt-6 p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">{String(selected.ticketNumber ?? selected.id)} · {String(selected.status ?? "")}</p><h2 className="mt-2 text-xl font-black">{String(selected.subject)}</h2><div className="mt-5 space-y-3">{messages.map((message) => <div key={message.id} className="rounded-[8px] border border-white/10 p-4"><p className="text-xs font-bold uppercase text-slate-500">{String(message.authorType ?? "reply")} · {String(message.createdAt ?? "")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{String(message.body ?? "")}</p></div>)}</div>{selected.status !== "closed" ? <div className="mt-5"><label className="block text-sm font-bold">Reply<textarea className="mt-2 min-h-24 w-full rounded-[8px] border border-white/10 bg-black/30 p-3" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} /></label><Button className="mt-3" onClick={() => void sendReply()} disabled={busy || !reply.trim()}>{busy ? "Sending..." : "Send reply"}</Button></div> : <p className="mt-5 text-sm text-slate-400">This ticket is closed. Create a new ticket for further help.</p>}</Card> : null}</AppShell>;
}
