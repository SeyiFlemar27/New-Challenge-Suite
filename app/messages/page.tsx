"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState } from "@/components/ui";

type Participant = { id: string; displayName: string; avatarUrl?: string | null; accountType?: string; role?: string | null };
type Conversation = { id: string; lastMessagePreview?: string; lastMessageAt?: string; updatedAt?: string; unread?: boolean; relatedChallengeId?: string | null; relatedProposalId?: string | null; otherParticipant?: Participant | null };

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

  return <AppShell><div className="mx-auto max-w-[1500px]">
    <div className="mb-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Global inbox</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Messages</h1><p className="mt-2 text-slate-600">Your user, creator, host, and sponsor conversations in one place.</p></div>
    <div className="grid min-h-[680px] overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-sm xl:grid-cols-[340px_minmax(0,1fr)_300px]">
      <aside className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r">
        <label className="relative block"><span className="sr-only">Search conversations</span><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-[8px] border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-950 outline-none focus:border-amber-400" placeholder="Search conversations" /></label>
        {result.isLoading ? <div className="mt-4 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-[8px] bg-slate-100" />)}</div> : null}
        {!result.isLoading && !result.data?.ok ? <p className="mt-4 rounded-[8px] bg-red-50 p-4 text-sm text-red-800">{result.data?.message ?? "Messages could not be loaded."}</p> : null}
        {!result.isLoading && result.data?.ok && !filtered.length ? <div className="mt-5"><EmptyState icon={<MessageSquare />} title={query ? "No matching conversations" : "No conversations yet"} body={query ? "Try a different name or message." : "Conversations appear after you contact a member from a profile, opportunity, proposal, or challenge."} /></div> : null}
        <div className="mt-4 space-y-2">{filtered.map((conversation) => <ConversationLink key={conversation.id} conversation={conversation} />)}</div>
      </aside>
      <main className="flex items-center justify-center border-b border-slate-200 p-6 xl:border-b-0 xl:border-r"><EmptyState icon={<MessageSquare />} title="Choose a conversation" body="Select a conversation to view the thread and its collaboration context." /></main>
      <aside className="p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Conversation safety</p><h2 className="mt-2 text-xl font-black text-slate-950">Context stays separate</h2><p className="mt-3 text-sm leading-6 text-slate-600">Messages do not accept a proposal, create funding, release money, or change campaign status. Those actions remain in their verified workflows.</p></aside>
    </div>
  </div></AppShell>;
}

function ConversationLink({ conversation }: { conversation: Conversation }) {
  const participant = conversation.otherParticipant;
  return <Link href={`/messages/${conversation.id}`} className="flex min-h-24 items-center gap-3 rounded-[8px] border border-transparent p-3 transition hover:border-amber-200 hover:bg-amber-50/60">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] text-sm font-black text-black">{participant?.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(participant?.displayName)}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate font-black text-slate-950">{participant?.displayName ?? "Challenge Suite member"}</span>{conversation.unread ? <span className="h-2 w-2 rounded-full bg-[var(--gold)]" aria-label="Unread conversation" /> : null}</span><span className="mt-1 block truncate text-sm text-slate-600">{conversation.lastMessagePreview ?? "Open conversation"}</span><span className="mt-2 block text-[11px] text-slate-500">{formatTime(conversation.lastMessageAt ?? conversation.updatedAt)}</span></span>
  </Link>;
}

function initials(name?: string) { return String(name ?? "?").split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function formatTime(value?: string) { if (!value) return ""; const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString() : ""; }
