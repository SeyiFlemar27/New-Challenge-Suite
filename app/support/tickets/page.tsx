"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Ticket = { id: string; ticketNumber: string; subject: string; category: string; status: string; createdAt: string; lastActivityAt?: string };
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void apiRequest<{ tickets: Ticket[] }>("/api/support/tickets").then((result) => { if (!active) return; if (result.data) setTickets(result.data.tickets); else setNotice(result.message); setLoading(false); }); return () => { active = false; }; }, []);
  return <AppShell><PageTitle title="My Requests" subtitle="Track your conversations with Challenge Suite Support." icon={<LifeBuoy className="text-[var(--gold)]" />} />{notice ? <p role="status" className="mt-4 text-sm">{notice}</p> : null}<div className="mt-7 grid gap-4 xl:grid-cols-2">{tickets.map((ticket) => <Link key={ticket.id} href={`/support/tickets/${encodeURIComponent(ticket.id)}`} className="rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]"><Card className="h-full p-5 transition hover:border-[var(--gold)]"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-black uppercase text-[var(--gold)]">{ticket.ticketNumber}</p><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold">{label(ticket.status)}</span></div><h2 className="mt-3 text-lg font-black">{ticket.subject}</h2><p className="mt-2 text-sm text-slate-400">{label(ticket.category)}</p><p className="mt-4 text-xs text-slate-500">Updated {ticket.lastActivityAt ? new Date(ticket.lastActivityAt).toLocaleString() : new Date(ticket.createdAt).toLocaleString()}</p></Card></Link>)}{loading ? <Card className="h-32 animate-pulse" aria-live="polite" /> : null}{!loading && !tickets.length ? <Card className="md:col-span-2"><EmptyState icon={<LifeBuoy />} title="No support requests yet" body="Requests you create will appear here." /><LinkButton href="/support/new" className="mt-5">Contact Support</LinkButton></Card> : null}</div></AppShell>;
}
