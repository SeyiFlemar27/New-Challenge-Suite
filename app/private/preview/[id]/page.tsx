"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { ContentImage } from "@/components/content-image";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { PrivatePublicVoting, type PrivatePublicVotingData } from "@/components/private-public-voting";
type Preview = PrivatePublicVotingData & { challenge: { title: string; description: string; creatorName: string; coverImage: string; canRequestAccess: boolean; publicVotingAvailable: boolean } };
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { user } = useCurrentUser();
  const query = useQuery({ queryKey: ["private-locked-preview", id], queryFn: () => apiRequest<Preview>(`/api/private-challenges/${encodeURIComponent(id)}/preview`) });
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const data = query.data?.data;
  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    try { const result = await apiRequest(path, { method: "POST", body: JSON.stringify(body) }); setMessage(result.message || "No result confirmed."); }
    catch { setMessage("The request could not be confirmed. Retry safely."); }
    finally { setBusy(false); }
  }
  return <AppShell><Card className="mx-auto max-w-3xl space-y-5 p-6">{query.isLoading ? <p aria-busy="true">Loading locked preview…</p> : !data ? <><h1 className="text-2xl font-black">Private Challenge</h1><p>{query.data?.message || "This challenge is restricted."}</p></> : <><h1 className="text-3xl font-black">{data.challenge.title}</h1>{data.challenge.coverImage ? <ContentImage src={data.challenge.coverImage} alt={data.challenge.title} className="aspect-video w-full rounded-lg object-cover" /> : null}<p>{data.challenge.creatorName}</p><p className="whitespace-pre-wrap">{data.challenge.description}</p><p className="font-bold">Locked · Access does not join or reserve a place.</p>
    {!user ? <LinkButton href={`/auth/login?next=${encodeURIComponent(`/private/preview/${id}`)}`}>Sign in to request access or vote</LinkButton> : data.challenge.canRequestAccess ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void act("/api/private-exclusive", { action: "request_access", challengeId: id, reason }); }}><Field label="Why would you like access?"><textarea className={textareaClass} required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button type="submit" disabled={busy || !reason.trim()}>Request Access</Button></form> : <p>Access requests are closed.</p>}
    {data.challenge.publicVotingAvailable ? <PrivatePublicVoting challengeId={id} data={data} signedIn={Boolean(user)} /> : null}</>}
    <p role="status" aria-live="polite">{message}</p><LinkButton variant="secondary" href="/private/code">Enter Invitation Code</LinkButton><LinkButton variant="ghost" href={`/challenges/${id}`}>Open challenge with existing access</LinkButton></Card></AppShell>;
}
