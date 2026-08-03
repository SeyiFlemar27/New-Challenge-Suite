"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ImageIcon, Search, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MediaUploadField } from "@/components/media-upload-field";
import { Button, EmptyState } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { sponsorConversationMediaPath } from "@/lib/media-upload-paths";

type Attachment = { url: string; path: string; fileName?: string | null; contentType?: string | null; size?: number | null };
type Participant = { id: string; displayName: string; avatarUrl?: string | null; role?: string | null; accountType?: string | null };
type Conversation = { id: string; participantIds?: string[]; status?: string; source?: string; relatedChallengeId?: string | null; relatedProposalId?: string | null; relatedCampaignId?: string | null; lastMessagePreview?: string; otherParticipant?: Participant | null; unread?: boolean };
type Message = { id: string; senderId?: string; body?: string; createdAt?: string; status?: string; attachments?: Attachment[] };

async function loadConversations() { const response = await fetch("/api/messages", { cache: "no-store" }); return response.json() as Promise<{ ok: boolean; data?: { conversations: Conversation[] } }> }
async function loadConversation(id: string) { const response = await fetch(`/api/messages/${id}`, { cache: "no-store" }); return response.json() as Promise<{ ok: boolean; message?: string; data?: { conversation: Conversation; messages: Message[] } }> }

export default function MessageThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const { user } = useCurrentUser();
  const conversationId = params?.conversationId ?? "";
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const conversationsResult = useQuery({ queryKey: ["messages", "conversations"], queryFn: loadConversations, refetchInterval: 15_000 });
  const threadResult = useQuery({ queryKey: ["messages", conversationId], queryFn: () => loadConversation(conversationId), enabled: Boolean(conversationId), refetchInterval: 8_000, staleTime: 3_000 });
  const conversations = conversationsResult.data?.ok ? conversationsResult.data.data?.conversations ?? [] : [];
  const filtered = useMemo(() => { const value = query.trim().toLowerCase(); return value ? conversations.filter((item) => `${item.otherParticipant?.displayName ?? ""} ${item.lastMessagePreview ?? ""}`.toLowerCase().includes(value)) : conversations; }, [conversations, query]);
  const selected = conversations.find((item) => item.id === conversationId) ?? threadResult.data?.data?.conversation;
  const messages = threadResult.data?.ok ? threadResult.data.data?.messages ?? [] : [];

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true); setNotice("");
    const response = await fetch(`/api/messages/${conversationId}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body: text, attachments }) });
    const data = await response.json() as { ok: boolean; message?: string };
    if (data.ok) { setBody(""); setAttachments([]); await threadResult.refetch(); } else setNotice(data.message ?? "Message could not be sent.");
    setSending(false);
  }

  return <AppShell><div className="mx-auto max-w-[1500px]">
    <div className="mb-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Global inbox</p><h1 className="mt-2 text-3xl font-black text-slate-950">Messages</h1></div>
    <div className="grid min-h-[700px] overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-sm xl:grid-cols-[330px_minmax(0,1fr)_310px]">
      <aside className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r"><label className="relative block"><span className="sr-only">Search conversations</span><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-[8px] border border-slate-200 pl-10 pr-4 text-sm text-slate-950 outline-none focus:border-amber-400" placeholder="Search conversations" /></label><div className="mt-4 space-y-2">{filtered.map((conversation) => <Link key={conversation.id} href={`/messages/${conversation.id}`} className={`flex min-h-20 items-center gap-3 rounded-[8px] p-3 ${conversation.id === conversationId ? "bg-amber-50 ring-1 ring-amber-200" : "hover:bg-slate-50"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{initials(conversation.otherParticipant?.displayName)}</span><span className="min-w-0"><span className="block truncate font-black text-slate-950">{conversation.otherParticipant?.displayName || "Challenge Suite member"}</span><span className="mt-1 block truncate text-sm text-slate-600">{conversation.lastMessagePreview || "Open conversation"}</span></span></Link>)}</div></aside>
      <main className="flex min-h-[700px] flex-col border-b border-slate-200 xl:border-b-0 xl:border-r"><div className="border-b border-slate-200 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">{selected?.source ? label(selected.source) : "Conversation"}</p><h2 className="mt-2 text-xl font-black text-slate-950">{selected?.otherParticipant?.displayName || "Collaboration conversation"}</h2></div><div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite">{threadResult.isLoading ? <p className="text-sm text-slate-500">Loading conversation...</p> : null}{!threadResult.isLoading && !threadResult.data?.ok ? <p className="rounded-[8px] bg-red-50 p-4 text-sm text-red-800">{threadResult.data?.message ?? "Conversation unavailable."}</p> : null}{!threadResult.isLoading && threadResult.data?.ok && !messages.length ? <EmptyState title="No messages yet" body="Write the first message below." /> : null}{messages.map((message) => { const own = message.senderId === user?.uid; return <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-[8px] px-4 py-3 sm:max-w-[72%] ${own ? "bg-[var(--gold)] text-black" : "bg-slate-100 text-slate-950"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>{message.attachments?.length ? <div className="mt-3 grid gap-2">{message.attachments.map((item) => <a key={item.path} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[8px] border border-current/15 p-2 text-xs font-bold">{item.contentType?.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}{item.fileName || "Open attachment"}</a>)}</div> : null}<p className="mt-1 text-[10px] opacity-60">{formatTime(message.createdAt)}</p></div></div> })}</div>
        <form onSubmit={send} className="border-t border-slate-200 bg-slate-50 p-4"><label className="sr-only" htmlFor="message-body">Message</label><textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value.slice(0, 2000))} rows={3} className="min-h-24 w-full resize-none rounded-[8px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-amber-400" placeholder="Write a message" />{user?.isSponsor ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><MediaUploadField label="Attach image" value={attachments.find((item) => item.contentType?.startsWith("image/"))?.url ?? ""} onChange={(url, metadata) => setAttachments((current) => [...current.filter((item) => !item.contentType?.startsWith("image/")), { url, path: metadata?.path ?? "", fileName: metadata?.fileName, contentType: metadata?.contentType, size: metadata?.size }])} storagePath={sponsorConversationMediaPath(conversationId, user.uid, "images")} kind="image" buttonLabel="Attach Image" /><MediaUploadField label="Attach document" value={attachments.find((item) => !item.contentType?.startsWith("image/"))?.url ?? ""} onChange={(url, metadata) => setAttachments((current) => [...current.filter((item) => item.contentType?.startsWith("image/")), { url, path: metadata?.path ?? "", fileName: metadata?.fileName, contentType: metadata?.contentType, size: metadata?.size }])} storagePath={sponsorConversationMediaPath(conversationId, user.uid, "documents")} kind="document" buttonLabel="Attach PDF / Document" /></div> : null}<div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className={notice ? "text-xs text-red-700" : "text-xs text-slate-500"}>{notice || "Messaging alone cannot accept a proposal or release funding."}</span><Button type="submit" disabled={!body.trim() || sending}><Send size={16} />{sending ? "Sending..." : "Send"}</Button></div></form>
      </main>
      <aside className="p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Context</p><h2 className="mt-2 text-xl font-black text-slate-950">Collaboration details</h2><dl className="mt-5 space-y-4 text-sm"><Info label="Member" value={selected?.otherParticipant?.displayName || "Member profile"} /><Info label="Status" value={label(selected?.status || "active")} /><Info label="Proposal" value={selected?.relatedProposalId ? "Linked proposal available" : "No linked proposal"} /><Info label="Challenge" value={selected?.relatedChallengeId ? "Linked challenge available" : "No linked challenge"} /></dl><div className="mt-6 grid gap-3">{selected?.relatedProposalId ? <Link href={`/sponsor/proposals/${selected.relatedProposalId}`} className="flex min-h-11 items-center justify-center rounded-[8px] border border-slate-200 px-4 text-sm font-bold text-slate-800">View Proposal</Link> : null}{selected?.relatedChallengeId ? <Link href={`/challenges/${selected.relatedChallengeId}`} className="flex min-h-11 items-center justify-center rounded-[8px] border border-slate-200 px-4 text-sm font-bold text-slate-800">View Challenge</Link> : null}</div><p className="mt-6 rounded-[8px] bg-amber-50 p-4 text-sm leading-6 text-amber-900">Funding appears only from an accepted proposal or eligible challenge funding flow.</p></aside>
    </div>
  </div></AppShell>;
}

function Info({ label: title, value }: { label: string; value: string }) { return <div><dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{title}</dt><dd className="mt-1 break-words font-bold text-slate-950">{value}</dd></div> }
function initials(name?: string) { return String(name ?? "?").split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() }
function formatTime(value?: string) { if (!value) return ""; const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString() : "" }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }
