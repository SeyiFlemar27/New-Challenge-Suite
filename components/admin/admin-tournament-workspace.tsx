"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Trophy } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

type TournamentRecord = Record<string, unknown> & { id: string };

export function AdminTournamentList() {
  const [records, setRecords] = useState<TournamentRecord[] | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<{ tournaments: TournamentRecord[] }>("/api/admin/tournaments").then((result) => { setRecords(result.ok ? result.data?.tournaments ?? [] : []); setMessage(result.ok ? "" : result.message); }); }, []);
  return <><PageTitle title="Tournament Operations" subtitle="Review real tournament records, participation, results, disputes, and audited operational status." icon={<Trophy />} />{message ? <Card className="mt-6 p-5 text-sm">{message}</Card> : null}{records === null ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div> : records.length ? <div className="mt-8 grid gap-5 xl:grid-cols-2">{records.map((item) => <Card key={item.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{String(item.status ?? "draft").replaceAll("_", " ")}</p><h2 className="mt-2 text-xl font-black">{String(item.title ?? "Tournament")}</h2></div><ShieldCheck size={18} /></div><p className="mt-3 text-sm text-slate-400">Participants: {Number(item.participantCount ?? 0)} / {Number(item.participantCapacity ?? 0)}</p><LinkButton href={`/admin/tournaments/${item.id}`} className="mt-5">Review tournament</LinkButton></Card>)}</div> : <Card className="mt-8"><EmptyState icon={<ShieldAlert />} title="No tournament records" body="Real tournament records will appear here when hosts create them." /></Card>}</>;
}

export function AdminTournamentDetail({ id }: { id: string }) {
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<Record<string, unknown>>(`/api/admin/tournaments/${encodeURIComponent(id)}`).then((result) => { setBundle(result.ok ? result.data ?? {} : {}); setMessage(result.ok ? "" : result.message); }); }, [id]);
  const tournament = bundle?.tournament as TournamentRecord | undefined;
  const counts = [["Participants", "participants"], ["Rounds", "rounds"], ["Matches", "matches"], ["Submissions", "submissions"], ["Reports", "reports"], ["Disputes", "disputes"], ["Audit events", "audits"]] as const;
  return <>{message ? <Card className="p-5">{message}</Card> : null}{bundle === null ? <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div> : tournament ? <><div className="flex flex-wrap items-end justify-between gap-4"><PageTitle title={String(tournament.title ?? "Tournament")} subtitle="Review tournament operations and recorded evidence. Sensitive decisions remain server-authorized and audited." icon={<ShieldCheck />} /><Link href="/admin/tournaments" className="text-sm font-bold text-amber-700">Back to tournaments</Link></div><div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{counts.map(([label, key]) => <Card key={key} className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{Array.isArray(bundle[key]) ? bundle[key].length : 0}</p></Card>)}</div><Card className="mt-6 p-5 text-sm leading-6 text-slate-300">Operational actions require a reason, server permission, and an audit event. No payout provider, refund provider, raw vote edit, or balance overwrite is executed here.</Card></> : <Card><EmptyState icon={<ShieldCheck />} title="Tournament unavailable" body="This record does not exist or your role cannot access it." /></Card>}</>;
}
