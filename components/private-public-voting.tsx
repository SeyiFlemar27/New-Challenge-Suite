"use client";
import { useRef, useState } from "react";
import { voteForSubmission } from "@/lib/api/services";
import { Button, LinkButton } from "@/components/ui";
import { ContentImage } from "@/components/content-image";
import { apiRequest } from "@/lib/api/client";
export type PrivatePublicVotingData = { voting: { automaticFreeFirst?: boolean; free: boolean; dorocoin: boolean; doroCoinCost: number }; submissions: { id: string; title: string; mediaUrl: string; mediaType: string }[] };
export function PrivatePublicVoting({ challengeId, data, signedIn }: { challengeId: string; data: PrivatePublicVotingData; signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [coinReturn, setCoinReturn] = useState<string | null>(null);
  const attempts = useRef<Record<string, string>>({});
  async function vote(submissionId: string, voteMode: "free" | "dorocoin") {
    if (busy || !signedIn) return;
    setBusy(true);
    setCoinReturn(null);
    try {
      let balance: number | null = null;
      if (data.voting.automaticFreeFirst) {
        const state = await apiRequest<{ canVote: boolean; freeVote: { used: boolean }; balance: number }>(`/api/votes?challengeId=${encodeURIComponent(challengeId)}`);
        if (!state.ok || !state.data?.canVote) { setMessage(state.message || "Current voting eligibility is unavailable."); return; }
        voteMode = state.data.freeVote.used ? "dorocoin" : "free";
        balance = state.data.balance;
        if (voteMode === "dorocoin" && balance < 5) {
          setCoinReturn(`/dorocoins?returnTo=${encodeURIComponent(`/private/preview/${encodeURIComponent(challengeId)}?submissionId=${encodeURIComponent(submissionId)}`)}`);
          setMessage("You need 5 DoroCoins for an additional vote. Buying coins does not cast a vote; return here to confirm it."); return;
        }
      }
      if (voteMode === "dorocoin" && !window.confirm(`Spend ${data.voting.doroCoinCost} DoroCoins for one additional vote?${balance === null ? "" : ` Current balance: ${balance} DoroCoins.`}`)) return;
      const attempt = `${submissionId}:${voteMode}`;
      const idempotencyKey = attempts.current[attempt] ??= crypto.randomUUID();
      const result = await voteForSubmission({ challengeId, submissionId, voteMode, quantity: 1, idempotencyKey, confirmedDoroCoinSpend: voteMode === "dorocoin" });
      if (result.ok || result.status && result.status >= 400 && result.status < 500) delete attempts.current[attempt];
      setMessage(result.message || "No vote result was confirmed.");
    } catch { setMessage("Your vote could not be confirmed. Check your vote history before retrying a paid vote."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4"><h2 className="text-xl font-black">Public voting</h2><p className="text-sm">Approved competing submissions only. Voting does not grant private access. Shared voting limits apply.</p>
    {data.submissions.map((item) => <article className="rounded-lg border p-4" key={item.id}><h3 className="font-bold">{item.title}</h3>{item.mediaUrl ? item.mediaType === "video" ? <video className="mt-3 w-full" src={item.mediaUrl} controls preload="metadata" /> : <ContentImage className="mt-3 max-h-80 w-full object-contain" src={item.mediaUrl} alt={item.title} /> : null}<div className="mt-3 flex flex-wrap gap-3">{data.voting.free ? <Button disabled={!signedIn || busy} onClick={() => void vote(item.id, "free")}>{data.voting.automaticFreeFirst ? "Vote" : "Free Vote"}</Button> : null}{!data.voting.automaticFreeFirst && data.voting.dorocoin ? <Button variant="secondary" disabled={!signedIn || busy} onClick={() => void vote(item.id, "dorocoin")}>Additional Vote · {data.voting.doroCoinCost} DC</Button> : null}</div></article>)}
    {!data.submissions.length ? <p>No approved public submissions are available.</p> : null}<p role="status" aria-live="polite">{message}</p>
    {coinReturn ? <LinkButton href={coinReturn} variant="secondary">Buy DoroCoins and return to this preview</LinkButton> : null}
  </section>;
}
