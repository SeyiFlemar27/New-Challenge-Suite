"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Draft = {
  id: string;
  title?: string;
  status?: string;
  confirmedCreatorPrizeFundingCents?: number;
  monetization?: { creatorPrizeFundingRequiredCents?: number; creatorPrizeFundingStatus?: string };
};

export default function CreatorPrizeFundingPage() {
  const { id } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await apiRequest<{ challenge: Draft }>(`/api/challenges/drafts/${id}`);
      if (!result.ok || !result.data?.challenge) {
        setDraft(null);
        setMessage(result.message || "Challenge draft could not be loaded.");
        return;
      }
      setDraft(result.data.challenge);
      const requiredCents = Number(result.data.challenge.monetization?.creatorPrizeFundingRequiredCents ?? 0);
      if (requiredCents > 0) setAmount(String(requiredCents / 100));
    } catch {
      setDraft(null);
      setMessage("Challenge draft could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function checkout() {
    const amountCents = Math.round(Number(amount) * 100);
    setSubmitting(true);
    setMessage("");
    const result = await apiRequest<{ url?: string }>(`/api/challenges/${id}/prize-funding/checkout`, { method: "POST", body: JSON.stringify({ amountCents }) });
    setSubmitting(false);
    if (!result.ok || !result.data?.url) {
      setMessage(result.message || "Prize funding checkout could not be started.");
      return;
    }
    window.location.assign(result.data.url);
  }

  const confirmed = Number(draft?.confirmedCreatorPrizeFundingCents ?? 0);
  return <AppShell><div className="mx-auto max-w-3xl">
    <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator prize funding</p>
    <h1 className="mt-3 text-3xl font-black">Fund a guaranteed prize</h1>
    <p className="mt-3 max-w-2xl leading-7 text-slate-300">Reserve creator-funded prize money before publication. Your guaranteed prize is reserved after Stripe confirms the payment.</p>
    {loading ? <Card className="mt-7 h-64 animate-pulse" aria-label="Loading prize funding" /> : !draft ? <Card className="mt-7 p-6" role="alert"><p className="text-red-200">{message || "Challenge draft could not be loaded."}</p><Button className="mt-5" variant="secondary" onClick={() => void load()}>Retry</Button></Card> : <Card className="mt-7 p-5 sm:p-7">
      <h2 className="break-words text-xl font-black">{draft.title || "Challenge draft"}</h2>
      {confirmed > 0 ? <><p className="mt-4 text-sm text-emerald-200" aria-live="polite">Confirmed creator funding: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(confirmed / 100)}</p><LinkButton className="mt-5" href={`/challenges/create/${id}`}>Return to Builder</LinkButton></> : <>
        <div className="mt-5"><Field label="Guaranteed prize amount"><input className={inputClass} type="number" min="5" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field></div>
        <div className="mt-5 rounded-[8px] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300"><p>Funding source: Creator or host payment</p><p>Winner allocation: 100% of confirmed creator funding</p><p>Winner release: After approved results and the dispute review period</p></div>
        {message ? <p className="mt-4 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200" role="alert">{message}</p> : null}
        <div className="mt-6 grid gap-3 sm:flex"><Button onClick={() => void checkout()} disabled={submitting || Number(amount) < 5}>{submitting ? "Starting Checkout..." : "Review and Fund Prize"}</Button><LinkButton href={`/challenges/create/${id}`} variant="secondary">Back to Builder</LinkButton></div>
      </>}
    </Card>}
  </div></AppShell>;
}
