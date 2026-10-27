"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { ChallengeSafetyAction } from "@/components/challenge-safety-action";
import { ChallengeShare } from "@/components/challenge-share";
import { PrivatePublicVoting, type PrivatePublicVotingData } from "@/components/private-public-voting";

type Preview = PrivatePublicVotingData & { challenge: { title: string; description: string; creatorName: string; coverImage: string; accessMethod: string | null; canRequestAccess: boolean; publicVotingAvailable: boolean } };
/** Deliberately consumes only the public preview DTO. Protected gallery/eligibility is never requested here. */
export function PrivateLockedDetail({ id }: { id: string }) {
  const { user } = useCurrentUser();
  const query = useQuery({ queryKey: ["private-locked-preview", id, user?.uid ?? "signed-out"], queryFn: () => apiRequest<Preview>(`/api/private-challenges/${encodeURIComponent(id)}/preview`) });
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const data = query.data?.data;
  async function requestAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || requested) return;
    setBusy(true);
    try {
      const result = await apiRequest("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "request_access", challengeId: id, reason }) });
      setMessage(result.message || "Your request could not be confirmed.");
      if (result.ok) setRequested(true);
    } catch { setMessage("Your request could not be confirmed. Please retry."); }
    finally { setBusy(false); }
  }
  return <AppShell><main className="mx-auto max-w-[1240px] pb-12">
    <LinkButton variant="ghost" href="/explore">← Back to Explore</LinkButton>
    {query.isLoading ? <Card className="mt-5 p-8" aria-busy="true">Loading private challenge…</Card> : !data ? <Card className="mt-5 p-8"><h1 className="text-2xl font-bold">Private Challenge</h1><p className="mt-3">{query.data?.message || "This challenge is restricted."}</p><Button variant="secondary" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></Card> : <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
      <section className="min-w-0 space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950"><LockKeyhole size={15} />Private Challenge</p>
        <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-100 p-6 text-center text-slate-700"><LockKeyhole size={36} aria-hidden="true" /><p className="mt-4 text-xl font-bold">This is a private challenge</p><p className="mt-2 max-w-sm text-sm">Access is required to view protected challenge content and participate.</p></div>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{data.challenge.title}</h1>
        {data.challenge.creatorName ? <p className="text-sm text-slate-600">{data.challenge.creatorName}</p> : null}
        <Card className="p-5"><h2 className="text-xl font-bold">Overview</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.challenge.description || "No public description has been provided."}</p></Card>
        <div className="flex flex-wrap gap-3"><ChallengeShare path={`/challenges/${encodeURIComponent(id)}`} title={data.challenge.title} /><ChallengeSafetyAction challengeId={id} /></div>
        {data.challenge.publicVotingAvailable ? <PrivatePublicVoting challengeId={id} data={data} signedIn={Boolean(user)} /> : null}
      </section>
      <aside className="space-y-5"><Card className="p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><LockKeyhole size={20} />Private access</h2><p className="mt-3 text-sm leading-6 text-slate-600">Access does not join the challenge or reserve a place. Eligibility, availability and any entry payment are checked separately.</p>
        {data.challenge.accessMethod === "invitation_code" ? <LinkButton className="mt-5 w-full" href="/private/code">Enter Invitation Code</LinkButton> : data.challenge.accessMethod === "invite_link" ? <p className="mt-5 text-sm">Open the invitation link shared by the creator.</p> : data.challenge.accessMethod === "direct_invitations" ? <p className="mt-5 text-sm">Use your personal invitation from the creator.</p> : null}
        {data.challenge.canRequestAccess ? !user ? <LinkButton className="mt-4 w-full" variant="secondary" href={`/auth/login?next=${encodeURIComponent(`/challenges/${id}`)}`}>Sign in to Request Access</LinkButton> : <form onSubmit={requestAccess} className="mt-5 space-y-3"><Field label="Why would you like access?"><textarea className={textareaClass} required maxLength={1000} disabled={requested || busy} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button className="w-full" disabled={requested || busy || !reason.trim()}>{requested ? "Request sent" : busy ? "Sending…" : "Request Access"}</Button></form> : null}
        <LinkButton className="mt-4 w-full" variant="ghost" href={`/challenges/${encodeURIComponent(id)}`}>Open with existing access</LinkButton>
        <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>
      </Card></aside>
    </div>}
  </main></AppShell>;
}
