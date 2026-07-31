"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

type Message = { id: string; senderId?: string; body?: string; createdAt?: string; status?: string };
type Conversation = { id: string; participantIds?: string[]; status?: string };

async function loadConversation(id: string) {
  const response = await fetch(`/api/messages/${id}`, { cache: "no-store" });
  return response.json() as Promise<{ ok: boolean; message?: string; data?: { conversation: Conversation; messages: Message[] } }>;
}

export default function MessageThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const { user } = useCurrentUser();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const conversationId = params?.conversationId ?? "";
  const result = useQuery({ queryKey: ["messages", conversationId], queryFn: () => loadConversation(conversationId), enabled: Boolean(conversationId), refetchInterval: 8_000, staleTime: 3_000 });
  const messages = result.data?.ok ? result.data.data?.messages ?? [] : [];

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice("");
    const response = await fetch(`/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ body: text })
    });
    const data = await response.json() as { ok: boolean; message?: string };
    if (data.ok) {
      setBody("");
      await result.refetch();
    } else {
      setNotice(data.message ?? "Message could not be sent.");
    }
    setSending(false);
  }

  return <AppShell><div className="mx-auto flex min-h-[70vh] max-w-5xl flex-col">
    <div className="mb-5 flex items-center gap-3"><Link href="/messages" className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Back to conversations"><ArrowLeft size={18} /></Link><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Messages</p><h1 className="text-2xl font-black">Conversation</h1></div></div>
    <Card className="flex min-h-[55vh] flex-1 flex-col overflow-hidden p-0">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {result.isLoading ? <p className="text-sm text-slate-400">Loading conversation...</p> : null}
        {!result.isLoading && !result.data?.ok ? <p className="rounded-[8px] bg-red-950/30 p-4 text-sm text-red-200">{result.data?.message ?? "Conversation unavailable."}</p> : null}
        {!result.isLoading && result.data?.ok && !messages.length ? <p className="py-12 text-center text-sm text-slate-400">No messages yet.</p> : null}
        {messages.map((message) => {
          const own = message.senderId === user?.uid;
          return <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-[8px] px-4 py-3 sm:max-w-[70%] ${own ? "bg-[var(--gold)] text-black" : "bg-white/5 text-white"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p><p className={`mt-1 text-[10px] ${own ? "text-black/60" : "text-slate-500"}`}>{formatTime(message.createdAt)}</p></div></div>;
        })}
      </div>
      <form onSubmit={send} className="border-t border-white/10 p-3 sm:p-4">
        <label className="sr-only" htmlFor="message-body">Message</label>
        <div className="flex items-end gap-2"><textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value.slice(0, 2000))} rows={2} className="min-h-12 flex-1 resize-none rounded-[8px] border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-[var(--gold)]/50" placeholder="Write a message" /><Button type="submit" disabled={!body.trim() || sending} aria-label="Send message"><Send size={17} /> <span className="hidden sm:inline">{sending ? "Sending..." : "Send"}</span></Button></div>
        <div className="mt-2 flex justify-between gap-3 text-xs"><span className={notice ? "text-red-300" : "text-slate-500"}>{notice || "Messages are visible only to conversation participants."}</span><span className="text-slate-600">{body.length}/2000</span></div>
      </form>
    </Card>
  </div></AppShell>;
}

function formatTime(value?: string) {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "";
}
