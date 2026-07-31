"use client";

import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";

type EntryRecord = {
  id?: string;
  challengeId?: string;
  challengeTitle?: string;
  title?: string;
  status?: string;
  voteCount?: number;
  createdAt?: string;
  challengeStatus?: string;
  participantStatus?: string;
  paymentStatus?: string;
  refundStatus?: string;
  cancelled?: boolean;
  cancellationDate?: string;
  cancellationReason?: string;
};

export default function MyEntriesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "my-entries"], queryFn: fetchDashboard, staleTime: 30_000 });
  const entries = (data?.ok ? data.data?.participantEntries ?? data.data?.submissions ?? [] : []) as EntryRecord[];

  return <AppShell>
    <PageTitle title="My Entries" subtitle="Track the challenges you joined, your submission status, and recorded votes." />
    {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <Card key={item} className="h-40 animate-pulse bg-[#171717]" />)}</div> :
      entries.length ? <div className="mt-8 grid gap-5 md:grid-cols-2">{entries.map((entry) => <Card key={entry.id ?? entry.challengeId} className="p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{entry.cancelled ? "Cancelled" : String(entry.status ?? entry.participantStatus ?? "recorded").replaceAll("_", " ")}</p><h2 className="mt-3 text-xl font-black">{entry.title || entry.challengeTitle || "Challenge Entry"}</h2>{entry.cancelled ? <div className="mt-4 space-y-2 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300"><p><b className="text-white">Cancelled:</b> {formatDate(entry.cancellationDate)}</p><p><b className="text-white">Reason:</b> {entry.cancellationReason || "No public reason was provided."}</p><p><b className="text-white">Payment:</b> {label(entry.paymentStatus)}</p><p><b className="text-white">Refund:</b> {label(entry.refundStatus)}</p></div> : <p className="mt-3 text-sm text-slate-300">{Number(entry.voteCount ?? 0)} recorded votes</p>}<div className="mt-5 flex flex-wrap gap-3">{entry.id ? <LinkButton href={`/submissions/${entry.id}`}>View My Entry</LinkButton> : null}{entry.challengeId ? <LinkButton href={`/challenges/${entry.challengeId}`} variant="secondary">View Challenge</LinkButton> : null}{entry.cancelled ? <LinkButton href="/contact" variant="secondary">Contact Support</LinkButton> : null}</div></Card>)}</div> :
      <EmptyState icon={<FileCheck2 />} title="No entries yet" body="Entries you submit to challenges will appear here." action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} />}
  </AppShell>;
}

function label(value: unknown) {
  return String(value ?? "not available").replaceAll("_", " ");
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "Date not available" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
