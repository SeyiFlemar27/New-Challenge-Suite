"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchChallengeDetails } from "@/lib/api/services";
import { DollarSign, Search, ShieldCheck, UserRound } from "lucide-react";

type Participant = { id: string; displayName?: string; username?: string | null; avatarUrl?: string | null; participantStatus?: string; entryStatus?: string | null; profilePath?: string };

export default function ChallengePredictionPage() {
  const params = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState("");
  const [stake, setStake] = useState("10");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRiskNotice, setAcceptedRiskNotice] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(12);
  const detailsQuery = useQuery({ queryKey: ["challenge-details", params.id, "prediction"], queryFn: () => fetchChallengeDetails(params.id), enabled: Boolean(params.id), staleTime: 30_000 });
  const featureQuery = useQuery({ queryKey: ["prediction-feature"], queryFn: () => apiRequest<any>("/api/predictions"), staleTime: 30_000 });
  const details = detailsQuery.data?.ok ? detailsQuery.data.data as any : null;
  const feature = featureQuery.data?.ok ? featureQuery.data.data?.feature : null;
  const participants: Participant[] = useMemo(() => details?.participants ?? [], [details?.participants]);
  const filtered = participants.filter((participant) => `${participant.displayName ?? ""} ${participant.username ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const visibleParticipants = filtered.slice(0, visible);
  const selected = participants.find((participant) => participant.id === participantId);
  const stakeAmount = Number(stake || 0);
  const platformFee = Math.round(stakeAmount * 7) / 100;
  const netStake = Math.max(0, Math.round((stakeAmount - platformFee) * 100) / 100);
  const providerActive = feature?.predictionPaymentsProvider === "stripe_approved" && feature?.featureFlagEnabled === true;

  async function submit() {
    if (!acceptedTerms || !acceptedRiskNotice) return setMessage("Accept the Prediction Arena terms and responsible-play notice before continuing.");
    const result = await apiRequest("/api/predictions", { method: "POST", body: JSON.stringify({ challengeId: params.id, predictedParticipantId: participantId, stakeAmountUsd: stakeAmount, acceptedTerms, acceptedRiskNotice }) });
    setMessage(result.message);
  }

  return (
    <AppShell>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5 sm:p-7 lg:p-9">
          <PageTitle title="Prediction Arena" subtitle="A compliance-gated real-money prediction foundation for eligible U.S. users. Provider approval, KYC, age, region, terms, market approval, and admin review are required before live activity." icon={<DollarSign />} />
          {detailsQuery.data && !detailsQuery.data.ok ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-4 text-red-200">{detailsQuery.data.message}</p> : null}
          {!providerActive ? <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5 p-5 text-yellow-100"><ShieldCheck className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Real-money Prediction Arena is not active yet.</h2><p className="mt-2 text-sm leading-6">Payment provider approval is required. This market remains a gated foundation and does not move money, settle results, or create payouts.</p><p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Provider state: {String(feature?.predictionPaymentsProvider ?? "disabled").replaceAll("_", " ")}</p></Card> : null}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Step 1</p><h2 className="mt-2 text-2xl font-black">Choose a participant</h2></div>
            <div className="relative sm:w-80"><Search className="pointer-events-none absolute left-3 top-3 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => { setSearch(event.target.value); setVisible(12); }} placeholder="Search participants" /></div>
          </div>
          {visibleParticipants.length ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleParticipants.map((participant) => <button key={participant.id} type="button" onClick={() => setParticipantId(participant.id)} className={`rounded-[8px] border p-4 text-left transition ${participantId === participant.id ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#151515] hover:border-[var(--gold)]/50"}`}><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-black/50">{participant.avatarUrl ? <img src={participant.avatarUrl} alt={participant.displayName ?? "Participant"} className="h-full w-full object-cover" /> : <UserRound className="text-[var(--gold)]" />}</div><div className="min-w-0"><p className="truncate font-black">{participant.displayName ?? "Participant"}</p>{participant.username ? <p className="truncate text-xs text-slate-400">@{participant.username}</p> : null}</div></div><div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]"><span className="rounded-full bg-white/10 px-3 py-1 text-slate-300">{String(participant.participantStatus ?? "active").replaceAll("_", " ")}</span>{participant.entryStatus ? <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[var(--gold)]">{participant.entryStatus.replaceAll("_", " ")}</span> : null}</div><div className="mt-4 grid grid-cols-2 gap-2"><span className="rounded-[8px] border border-white/10 px-3 py-2 text-center text-xs font-bold">Select</span><a href={participant.profilePath || "/profile"} onClick={(event) => event.stopPropagation()} className="rounded-[8px] border border-white/10 px-3 py-2 text-center text-xs font-bold text-[var(--gold)]">Profile</a></div></button>)}</div> : <Card className="mt-6 border-dashed p-6 text-center text-slate-400">No eligible participants are visible for this market.</Card>}
          {filtered.length > visibleParticipants.length ? <Button variant="secondary" className="mt-5" onClick={() => setVisible((value) => value + 24)}>Load More Participants</Button> : null}

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Field label="Selected participant"><input className={inputClass} value={selected?.displayName ?? "Select a participant above"} readOnly /></Field>
            <Field label="Stake amount (USD)"><input className={inputClass} type="number" min="1" max="500" value={stake} onChange={(event) => setStake(event.target.value)} /></Field>
          </div>
          <Card className="mt-6 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-sm leading-6 text-yellow-100">Platform fee: ${platformFee.toFixed(2)} (7%). Net prediction pool contribution: ${netStake.toFixed(2)}. The immediate fee treatment is marked pending client confirmation. Cancellation, suspension, or dispute outcomes create refund-review records only; no automatic refund execution is active.</Card>
          <div className="mt-5 grid gap-3">
            <label className="flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> <span>I accept the Prediction Arena terms, eligibility checks, and market rules.</span></label>
            <label className="flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={acceptedRiskNotice} onChange={(event) => setAcceptedRiskNotice(event.target.checked)} /> <span>I understand this is a risk-based prediction product pending compliance and provider approval. Settlement and refunds require admin review.</span></label>
          </div>
          {message ? <p className="mt-5 rounded-[8px] bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3"><Button onClick={submit} disabled={!participantId || stakeAmount < 1 || !providerActive}>Continue to Payment Review</Button><LinkButton href={`/challenges/${params.id}`} variant="secondary">Back to Challenge</LinkButton></div>
        </Card>
        <Card className="h-fit p-6 sm:p-7"><h2 className="text-xl font-black">Eligibility gates</h2><div className="mt-5 space-y-3 text-sm text-slate-300">{["Feature flag enabled", "Payment provider approved", "KYC verified", "Age verified", "U.S. state eligibility supported", "Terms and risk notice accepted", "Admin market approval", "Prediction window open"].map((item) => <p key={item} className="rounded-[8px] bg-white/[0.04] p-3 font-bold">{item}</p>)}</div><p className="mt-5 text-xs leading-5 text-slate-500">Challenge Suite does not store raw ID images or face scans. Provider approval and compliance review are required before activation.</p></Card>
      </div>
    </AppShell>
  );
}
