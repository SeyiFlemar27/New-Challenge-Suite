"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageTitle } from "@/components/ui";

type Participant = { id: string; displayName: string; username?: string | null; avatarUrl?: string | null; accountType?: string; role?: string | null };
type Conversation = {
  id: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  unread?: boolean;
  otherParticipant?: Participant | null;
};

async function loadConversations() {
  const response = await fetch("/api/messages", { cache: "no-store" });
  return response.json() as Promise<{ ok: boolean; message?: string; data?: { conversations: Conversation[]; unreadCount: number } }>;
}

export default function MessagesPage() {
  const [query, setQuery] = useState("");
  const result = useQuery({ queryKey: ["messages", "conversations"], queryFn: loadConversations, refetchInterval: 15_000, staleTime: 5_000 });
  const conversations = result.data?.ok ? result.data.data?.conversations ?? [] : [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? conversations.filter((item) => `${item.otherParticipant?.displayName ?? ""} ${item.lastMessagePreview ?? ""}`.toLowerCase().includes(normalized)) : conversations;
  }, [conversations, query]);

  return <AppShell><div className="mx-auto max-w-5xl">
    <PageTitle title="Messages" subtitle="Your Challenge Suite conversations and collaboration updates." icon={<MessageSquare className="text-[var(--gold)]" />} />
    <Card className="mt-6 p-3 sm:p-4">
      <label className="relative block"><span className="sr-only">Search conversations</span><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-[8px] border border-white/10 bg-black/40 pl-10 pr-4 text-sm outline-none focus:border-[var(--gold)]/50" placeholder="Search conversations" /></label>
    </Card>
    {result.isLoading ? <div className="mt-6 space-y-3">{[0, 1, 2].map((item) => <Card key={item} className="h-24 animate-pulse bg-[#151515]" />)}</div> : null}
    {!result.isLoading && !result.data?.ok ? <Card className="mt-6 p-6 text-slate-300">{result.data?.message ?? "Messages could not be loaded."}</Card> : null}
    {!result.isLoading && result.data?.ok && !filtered.length ? <Card className="mt-6"><EmptyState icon={<MessageSquare className="text-[var(--gold)]" />} title={query ? "No matching conversations" : "No conversations yet"} body={query ? "Try a different name or message." : "Open a member profile, challenge, invitation, or opportunity to start a conversation."} /></Card> : null}
    {filtered.length ? <div className="mt-6 overflow-hidden rounded-[8px] border border-white/10 bg-[#111]">{filtered.map((conversation) => {
      const participant = conversation.otherParticipant;
      return <Link key={conversation.id} href={`/messages/${conversation.id}`} className="flex min-h-24 items-center gap-4 border-b border-white/5 p-4 transition last:border-b-0 hover:bg-white/[0.03]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] text-sm font-black text-black">{participant?.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(participant?.displayName)}</span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate font-black">{participant?.displayName ?? "Challenge Suite member"}</span>{participant?.role || participant?.accountType ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-slate-400">{participant.role ?? participant.accountType}</span> : null}{conversation.unread ? <span className="h-2 w-2 rounded-full bg-[var(--gold)]" aria-label="Unread conversation" /> : null}</span><span className="mt-1 block truncate text-sm text-slate-400">{conversation.lastMessagePreview ?? "Open conversation"}</span></span>
        <span className="hidden shrink-0 text-xs text-slate-500 sm:block">{formatTime(conversation.lastMessageAt ?? conversation.updatedAt)}</span>
      </Link>;
    })}</div> : null}
  </div></AppShell>;
}

function initials(name?: string) {
  return String(name ?? "?").split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "";
}
