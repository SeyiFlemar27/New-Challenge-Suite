"use client";

import { useEffect, useState } from "react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { SponsorFeatureGate } from "@/components/sponsor/sponsor-feature-gate";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type SponsorMessage = { id: string; recipientId?: string; challengeId?: string | null; body?: string; createdAt?: string };
type SponsorProfile = { sponsorVerificationStatus?: string | null; subscriptionStatus?: string | null; planStatus?: string | null; stripeStatus?: string | null };

export default function SponsorMessagesPage() {
  const [messages, setMessages] = useState<SponsorMessage[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<SponsorProfile | null>(null);

  useEffect(() => {
    void apiRequest<{ sponsorProfile: SponsorProfile }>("/api/sponsor/profile").then((result) => setProfile(result.ok ? result.data?.sponsorProfile ?? null : null));
    void apiRequest<{ messages: SponsorMessage[] }>("/api/sponsor/messages").then((result) => setMessages(result.ok ? result.data?.messages ?? [] : []));
  }, []);

  async function send() {
    const result = await apiRequest<{ message: SponsorMessage }>("/api/sponsor/messages", {
      method: "POST",
      body: JSON.stringify({ recipientId, challengeId, body })
    });
    setNotice(result.message);
    if (result.ok && result.data?.message) {
      setMessages((current) => [result.data!.message, ...current]);
      setBody("");
    }
  }

  return (
    <SponsorShell profile={profile}>
      <div className="max-w-4xl">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Brand Command Center</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Creator & Host Messages</h1>
        <p className="mt-3 text-slate-300">Start a conversation before proposing sponsorship. Sending a message does not reserve a slot, capture money, or create a sponsorship agreement.</p>
        <SponsorFeatureGate feature="messages" title="Messages" currentStatus={profile?.sponsorVerificationStatus} subscriptionStatus={profile?.subscriptionStatus ?? profile?.planStatus ?? profile?.stripeStatus}>
        <Card className="mt-8 grid gap-5 p-5 sm:p-7 md:grid-cols-2">
          <Field label="Creator / Host User ID"><input className={inputClass} value={recipientId} onChange={(event) => setRecipientId(event.target.value)} /></Field>
          <Field label="Challenge ID (optional)"><input className={inputClass} value={challengeId} onChange={(event) => setChallengeId(event.target.value)} /></Field>
          <div className="md:col-span-2"><Field label="Message"><textarea className={textareaClass} value={body} onChange={(event) => setBody(event.target.value)} /></Field></div>
          <div className="md:col-span-2"><Button onClick={() => void send()} disabled={!recipientId || body.trim().length < 2}>Send Message</Button></div>
          {notice ? <p className="md:col-span-2 text-sm text-slate-300">{notice}</p> : null}
        </Card>
        <div className="mt-8 space-y-3">
          {messages.length ? messages.map((message) => <Card key={message.id} className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">To {message.recipientId}{message.challengeId ? ` · Challenge ${message.challengeId}` : ""}</p><p className="mt-2 whitespace-pre-wrap break-words text-slate-200">{message.body}</p></Card>) : <Card className="p-6 text-slate-300">No sponsor messages yet.</Card>}
        </div>
        </SponsorFeatureGate>
      </div>
    </SponsorShell>
  );
}
