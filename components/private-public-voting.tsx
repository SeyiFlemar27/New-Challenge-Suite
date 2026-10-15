"use client";
import { useRef, useState } from "react";
import { voteForSubmission } from "@/lib/api/services";
import { Button } from "@/components/ui";
import { ContentImage } from "@/components/content-image";
export type PrivatePublicVotingData = { voting: { free: boolean; dorocoin: boolean; doroCoinCost: number }; submissions: { id: string; title: string; mediaUrl: string; mediaType: string }[] };
export function PrivatePublicVoting({ challengeId, data, signedIn }: { challengeId: string; data: PrivatePublicVotingData; signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attempts = useRef<Record<string, string>>({});
  async function vote(submissionId: string, voteMode: "free" | "dorocoin") {
    if (busy || !signedIn) return;
    if (voteMode === "dorocoin" && !window.confirm(`Spend ${data.voting.doroCoinCost} DoroCoins for one additional vote?`)) return;
    setBusy(true);
    try {
      const attempt = `${submissionId}:${voteMode}`;
      const idempotencyKey = attempts.current[attempt] ??= crypto.randomUUID();
      const result = await voteForSubmission({ challengeId, submissionId, voteMode, quantity: 1, idempotencyKey });
      if (result.ok || result.status && result.status >= 400 && result.status < 500) delete attempts.current[attempt];
      setMessage(result.message || "No vote result was confirmed.");
    } catch { setMessage("Your vote could not be confirmed. Check your vote history before retrying a paid vote."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4"><h2 className="text-xl font-black">Public voting</h2><p className="text-sm">Approved competing submissions only. Voting does not grant private access. Shared voting limits apply.</p>
    {data.submissions.map((item) => <article className="rounded-lg border p-4" key={item.id}><h3 className="font-bold">{item.title}</h3>{item.mediaUrl ? item.mediaType === "video" ? <video className="mt-3 w-full" src={item.mediaUrl} controls preload="metadata" /> : <ContentImage className="mt-3 max-h-80 w-full object-contain" src={item.mediaUrl} alt={item.title} /> : null}<div className="mt-3 flex flex-wrap gap-3">{data.voting.free ? <Button disabled={!signedIn || busy} onClick={() => void vote(item.id, "free")}>Free Vote</Button> : null}{data.voting.dorocoin ? <Button variant="secondary" disabled={!signedIn || busy} onClick={() => void vote(item.id, "dorocoin")}>Additional Vote · {data.voting.doroCoinCost} DC</Button> : null}</div></article>)}
    {!data.submissions.length ? <p>No approved public submissions are available.</p> : null}<p role="status" aria-live="polite">{message}</p>
  </section>;
}
