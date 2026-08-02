"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, Send, Star } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, EmptyState, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { MediaUploadField } from "@/components/media-upload-field";
import { MessageAttachmentPreview } from "@/components/media-display";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { sponsorConversationMediaPath } from "@/lib/media-upload-paths";

type Conversation = Record<string, any>;
type Message = Record<string, any>;
type Attachment = { url: string; path: string; fileName?: string; contentType?: string; size?: number };

export default function SponsorMessagesPage() {
  const auth = useAuth();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftConversationId] = useState(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `draft_${Date.now()}`;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    setProposalId(url.searchParams.get("proposalId") ?? "");
    setChallengeId(url.searchParams.get("challengeId") ?? "");
    setRecipientId(url.searchParams.get("recipientId") ?? "");
    setTitle(url.searchParams.get("title") ?? "");
    void load();
  }, []);

  async function load() {
    const [profileResult, messagesResult] = await Promise.all([
      apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"),
      apiRequest<{ conversations: Conversation[]; messages: Message[] }>("/api/sponsor/messages")
    ]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
    if (messagesResult.ok && messagesResult.data) {
      setConversations(messagesResult.data.conversations);
      setMessages(messagesResult.data.messages);
      setSelectedId((current) => current || messagesResult.data?.conversations?.[0]?.id || "");
    } else {
      setNotice(messagesResult.message || "Messages could not be loaded.");
    }
    setLoading(false);
  }

  async function send() {
    const conversationId = selected?.id || draftConversationId;
    const result = await apiRequest<{ conversation: Conversation; message: Message }>("/api/sponsor/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId, recipientId, proposalId, challengeId, title, body, attachments })
    });
    setNotice(result.message);
    if (result.ok) {
      setBody("");
      setTitle("");
      setRecipientId("");
      setAttachments([]);
      setSelectedId(result.data?.conversation?.id ?? selectedId);
      void load();
    }
  }

  const filtered = useMemo(() => conversations.filter((item) => !query || [item.title, item.recipientId, item.relatedProposalId, item.relatedChallengeId, item.lastMessagePreview].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [conversations, query]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const thread = selected ? messages.filter((item) => item.conversationId === selected.id) : [];
  const uploadConversationId = selected?.id || draftConversationId;
  const contextRecipientId = selected?.recipientId || recipientId;
  const contextTitle = selected?.title || title || (challengeId ? "Sponsorship discussion" : "");
  const canSend = body.trim().length >= 2 && Boolean(contextRecipientId);

  return <SponsorShell profile={profile}>
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Messaging Workspace</p>
          <h1 className="mt-3 text-4xl font-black">Sponsor conversations</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">Sponsor to creator/host conversations linked to opportunities, proposals, and custom challenge requests. No agreement, acceptance, email, or payment is created by messaging alone.</p>
        </div>
        <LinkButton href="/sponsor/proposals/new" variant="secondary">Create Proposal</LinkButton>
      </div>

      {notice ? <Card className="mt-5 p-4 text-sm text-slate-600">{notice}</Card> : null}

      <div className="mt-8 grid min-h-[680px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)_330px]">
        <Card className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} />
            <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
          </div>
          {loading ? <Card className="mt-4 h-28 animate-pulse bg-slate-100" /> : filtered.length === 0 ? <EmptyState icon={<MessageSquare />} title="No conversations yet." body="Your conversations will appear after a proposal is sent or a creator replies." /> : <div className="mt-4 space-y-3">
            {filtered.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full rounded-[8px] border p-4 text-left transition ${selected?.id === conversation.id ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-slate-200 bg-white hover:border-amber-300"}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-sm font-black text-black">{String(conversation.recipientName ?? conversation.recipientId ?? "C").slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-black text-slate-950">{conversation.title || "Sponsorship discussion"}</p>{conversation.saved ? <Star size={14} className="text-[var(--gold)]" /> : null}</div>
                  <p className="mt-1 truncate text-xs text-slate-500">{conversation.relatedChallengeTitle || conversation.relatedProposalId || conversation.relatedChallengeId || "Opportunity context pending"}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{conversation.lastMessagePreview || "No preview yet."}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{conversation.updatedAt || "Timestamp not available yet"}</p>
                </div>
              </div>
            </button>)}
          </div>}
        </Card>

        <Card className="flex min-h-[680px] flex-col overflow-hidden p-0">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{selected?.status || "Conversation"}</p>
            <h2 className="mt-2 text-2xl font-black">{selected?.title || title || "Start a sponsorship discussion"}</h2>
            <p className="mt-2 text-sm text-slate-500">{contextTitle || "Start from a creator profile, challenge opportunity, invite, or discovery card."}</p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {thread.length ? thread.map((message) => <div key={message.id} className="max-w-[82%] rounded-[10px] bg-[var(--gold)]/10 p-4 text-slate-100">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Sponsor / {message.status || "sent"}</p>
              <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>
              {Array.isArray(message.attachments) && message.attachments.length ? <div className="mt-3 grid gap-2">{message.attachments.map((attachment: Attachment) => <a key={attachment.path} href={attachment.url} className="block" target="_blank" rel="noreferrer"><MessageAttachmentPreview attachment={attachment} /></a>)}</div> : null}
              <p className="mt-2 text-xs text-slate-500">{message.createdAt || "Timestamp not available yet"}</p>
            </div>) : <div className="flex h-full items-center justify-center"><EmptyState icon={<MessageSquare />} title="No thread selected" body="Choose a conversation or start one using the composer below." /></div>}
          </div>
          <div className="border-t border-slate-200 bg-black/30 p-5">
            {!contextRecipientId ? <Card className="mb-4 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-amber-900">Start a conversation from a creator profile, host profile, challenge opportunity, invite button, or discovery card. Normal messaging does not require typing a user ID or thread title.</Card> : null}
            <textarea aria-label="Creator-visible message" className={textareaClass} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Discuss sponsor fit, placements, custom challenge ideas, or funding intent." />
            <div className="grid gap-3 md:grid-cols-2">
              <MediaUploadField label="Attach image" value={attachments.find((item) => String(item.contentType ?? "").startsWith("image/"))?.url ?? ""} onChange={(url, metadata) => setAttachments((current) => [...current.filter((item) => !String(item.contentType ?? "").startsWith("image/")), { url, path: metadata?.path ?? "", fileName: metadata?.fileName, contentType: metadata?.contentType, size: metadata?.size }])} storagePath={sponsorConversationMediaPath(uploadConversationId, auth.user?.uid ?? "anonymous", "images")} kind="image" buttonLabel="Attach Image" />
              <MediaUploadField label="Attach document" value={attachments.find((item) => !String(item.contentType ?? "").startsWith("image/"))?.url ?? ""} onChange={(url, metadata) => setAttachments((current) => [...current.filter((item) => String(item.contentType ?? "").startsWith("image/")), { url, path: metadata?.path ?? "", fileName: metadata?.fileName, contentType: metadata?.contentType, size: metadata?.size }])} storagePath={sponsorConversationMediaPath(uploadConversationId, auth.user?.uid ?? "anonymous", "documents")} kind="document" buttonLabel="Attach PDF / Document" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-500">Attachments require real upload completion. Images and PDFs/documents are supported; video attachments are not enabled.</p>
              <Button disabled={!canSend} onClick={() => void send()}><Send size={16} /> Send</Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Context</p>
          <h3 className="mt-2 text-xl font-black">Creator / opportunity summary</h3>
          <div className="mt-5 grid gap-3 text-sm">
            <Info label="Creator / host" value={selected?.recipientName || "Profile context loaded from conversation"} />
            <Info label="Challenge" value={selected?.relatedChallengeTitle || selected?.relatedChallengeId || challengeId} />
            <Info label="Proposal" value={selected?.relatedProposalId || proposalId} />
            <Info label="Sponsorship status" value={selected?.status || "pending discussion"} />
            <Info label="Funding status" value="Not available yet" />
          </div>
          <div className="mt-5 grid gap-3">
            <LinkButton href="/sponsor/proposals/new" variant="secondary">Create Proposal</LinkButton>
            <p className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">Funding becomes available from an accepted proposal or an eligible challenge funding page.</p>
            <LinkButton href={selected?.relatedChallengeId ? `/sponsor/discover/challenges/${selected.relatedChallengeId}` : "/sponsor/discover/challenges"} variant="ghost">View Challenge</LinkButton>
            <LinkButton href={selected?.recipientId ? `/sponsor/discover/creators/${selected.recipientId}` : "/sponsor/discover/creators"} variant="ghost">View Creator Profile</LinkButton>
          </div>
        </Card>
      </div>
    </div>
  </SponsorShell>;
}

function Info({ label, value }: { label: string; value: any }) {
  return <div className="rounded-[8px] bg-black/30 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-slate-950">{value || "Not available yet"}</p></div>;
}
