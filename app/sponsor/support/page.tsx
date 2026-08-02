"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, Paperclip } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Ticket = Record<string, unknown> & { id: string };
export default function SponsorSupportPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ tickets: Ticket[] }>("/api/support/tickets")]).then(([profileResult, ticketResult]) => { if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile); if (ticketResult.ok && ticketResult.data) setTickets(ticketResult.data.tickets); else setError(ticketResult.message || "Support tickets could not be loaded."); setLoading(false); }); }, []);
  return <SponsorShell profile={profile}><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsor support</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Get help with sponsor work</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Create and track real support tickets for profile, campaign, proposal, payment, or challenge issues.</p></div><LinkButton href="/support/new">Create Support Ticket</LinkButton></div>{error ? <Card className="mt-6 border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</Card> : null}{loading ? <Card className="mt-7 h-48 animate-pulse" /> : tickets.length ? <div className="mt-7 grid gap-4 md:grid-cols-2">{tickets.map((ticket) => <Card key={ticket.id} className="p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-amber-800">{label(ticket.status)}</p><h2 className="mt-2 break-words text-lg font-black text-slate-950">{String(ticket.subject || "Support ticket")}</h2><p className="mt-3 text-sm text-slate-600">{label(ticket.category)}</p></Card>)}</div> : <Card className="mt-7"><EmptyState icon={<LifeBuoy />} title="No support tickets yet" body="Tickets and admin responses will appear here after you submit a support request." action={<LinkButton href="/support/new">Create Ticket</LinkButton>} /></Card>}<Card className="mt-7 border-slate-200 bg-slate-50 p-5"><Paperclip className="text-slate-600" /><p className="mt-3 text-sm leading-6 text-slate-600">Support attachments use the authenticated native upload path. External attachment URLs are not accepted by the support API.</p></Card></div></SponsorShell>;
}
function label(value: unknown) { return String(value || "submitted").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }