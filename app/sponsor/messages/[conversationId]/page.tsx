"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

export default function SponsorConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  async function load() { const [profileResult, conversationResult] = await Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ conversation: any; messages: any[] }>(`/api/sponsor/messages/${params.conversationId}`)]); if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile); if (conversationResult.ok && conversationResult.data) { setConversation(conversationResult.data.conversation); setMessages(conversationResult.data.messages); } else setNotice(conversationResult.message || "Conversation could not be loaded."); setLoading(false); }
  useEffect(() => { void load(); }, [params.conversationId]);
  async function send() { const result = await apiRequest(`/api/sponsor/messages/${params.conversationId}`, { method: "POST", body: JSON.stringify({ body }) }); setNotice(result.message); if (result.ok) { setBody(""); void load(); } }
  return <SponsorShell profile={profile}>{loading ? <Card className="h-96 animate-pulse bg-[#171717]" /> : <div className="mx-auto max-w-5xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Conversation</p><h1 className="mt-3 text-4xl font-black">{conversation?.title || "Sponsor thread"}</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">Creator-visible business messages. Internal notes are managed separately and are never shown in this thread.</p></div><LinkButton href="/sponsor/messages" variant="secondary">All Messages</LinkButton></div>{notice ? <Card className="mt-6 p-4 text-sm text-slate-300">{notice}</Card> : null}<Card className="mt-8 p-6"><h2 className="text-2xl font-black">Thread context</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Info label="Recipient" value={conversation?.recipientId} /><Info label="Proposal" value={conversation?.relatedProposalId} /><Info label="Campaign" value={conversation?.relatedCampaignId} /></div></Card><div className="mt-8 space-y-4">{messages.length ? messages.map((message) => <Card key={message.id} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{message.status} / {message.deliveryStatus}</p><p className="mt-3 whitespace-pre-wrap text-slate-200">{message.body}</p><p className="mt-2 text-xs text-slate-500">{message.createdAt}</p></Card>) : <Card className="p-8 text-center text-slate-400"><MessageSquare className="mx-auto text-[var(--gold)]" /><p className="mt-3 font-bold">No messages in this conversation yet.</p></Card>}</div><Card className="mt-8 p-6"><Field label="Reply"><textarea className={textareaClass} value={body} onChange={(event) => setBody(event.target.value)} /></Field><Button className="mt-4" disabled={body.trim().length < 2} onClick={() => void send()}>Send Reply</Button></Card></div>}</SponsorShell>;
}
function Info({ label, value }: { label: string; value: any }) { return <div className="rounded-[8px] bg-black/30 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-white">{value || "Not available yet"}</p></div>; }
