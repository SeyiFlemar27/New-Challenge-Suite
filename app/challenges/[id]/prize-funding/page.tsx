"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Draft = { id: string; title?: string; status?: string; confirmedCreatorPrizeFundingCents?: number; monetization?: { creatorPrizeFundingRequiredCents?: number; creatorPrizeFundingStatus?: string } };

export default function CreatorPrizeFundingPage() {
  const { id } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<{ challenge: Draft }>(`/api/challenges/drafts/${id}`).then((result) => { if (result.ok && result.data?.challenge) { setDraft(result.data.challenge); const cents = Number(result.data.challenge.monetization?.creatorPrizeFundingRequiredCents ?? 0); if (cents > 0) setAmount(String(cents / 100)); } else setMessage(result.message); setLoading(false); }); }, [id]);
  async function checkout() {
    const amountCents = Math.round(Number(amount) * 100);
    setSubmitting(true); setMessage("");
    const result = await apiRequest<{ url?: string }>(`/api/challenges/${id}/prize-funding/checkout`, { method: "POST", body: JSON.stringify({ amountCents }) });
    setSubmitting(false);
    if (!result.ok || !result.data?.url) return setMessage(result.message || "Prize funding checkout could not be started.");
    window.location.assign(result.data.url);
  }
  const confirmed = Number(draft?.confirmedCreatorPrizeFundingCents ?? 0);
  return <AppShell><div className="mx-auto max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator prize funding</p><h1 className="mt-3 text-3xl font-black">Fund a guaranteed prize</h1><p className="mt-3 leading-7 text-slate-300">Reserve creator-funded prize money before publication. Your guaranteed prize is reserved after Stripe confirms the payment.</p>{loading ? <Card className="mt-7 h-64 animate-pulse" /> : !draft ? <Card className="mt-7 p-6 text-red-200">{message || "Challenge draft could not be loaded."}</Card> : <Card className="mt-7 p-6"><h2 className="text-xl font-black">{draft.title || "Challenge draft"}</h2>{confirmed > 0 ? <><p className="mt-4 text-sm text-emerald-200">Confirmed creator funding: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(confirmed / 100)}</p><LinkButton className="mt-5" href={`/challenges/create/${id}`}>Return to Builder</LinkButton></> : <><div className="mt-5"><Field label="Guaranteed prize amount"><input className={inputClass} type="number" min="5" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field></div><div className="mt-5 rounded-[8px] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300"><p>Funding source: Creator or host payment</p><p>Winner allocation: 100% of confirmed creator funding</p><p>Winner release: After approved results and the dispute review period</p></div>{message ? <p className="mt-4 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">{message}</p> : null}<div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => void checkout()} disabled={submitting || Number(amount) < 5}>{submitting ? "Starting Checkout..." : "Review and Fund Prize"}</Button><LinkButton href={`/challenges/create/${id}`} variant="secondary">Back to Builder</LinkButton></div></>}</Card>}</div></AppShell>;
}