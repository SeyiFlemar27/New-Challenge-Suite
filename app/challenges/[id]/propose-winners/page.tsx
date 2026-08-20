"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type WinnerCandidate = {
  id: string;
  submissionId: string;
  userId: string;
  displayName: string;
  title: string;
  voteCount: number;
  weightedVoteCount: number;
  submittedAt: string | null;
};

type CandidatePayload = {
  challenge: { id: string; title: string; status: string; participantCount: number; submissionCount: number; votingDeadline?: string | null };
  readiness: { ready: boolean; message: string; lifecycle: { primaryStatus: string; submissionStatus: string; votingStatus: string } };
  candidates: WinnerCandidate[];
  proposals: Array<{ id: string; status?: string; adminNote?: string | null; updatedAt?: string | null }>;
  activeProposal: { id: string; status?: string; winners?: Array<{ placement: number; submissionId?: string | null }>; notes?: string; adminNote?: string | null } | null;
  noEligibleCandidatesMessage: string | null;
};

const oneWinner = [{ placement: 1, splitPercent: 100 }];
const twoWinners = [{ placement: 1, splitPercent: 70 }, { placement: 2, splitPercent: 30 }];
const threeWinners = [{ placement: 1, splitPercent: 50 }, { placement: 2, splitPercent: 30 }, { placement: 3, splitPercent: 20 }];

function label(value: unknown) {
  return String(value ?? "not available").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProposeWinnersPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const [mode, setMode] = useState<"one" | "two" | "three">("one");
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const initializedProposalId = useRef("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["winner-candidates", challengeId],
    queryFn: () => apiRequest<CandidatePayload>(`/api/challenges/${challengeId}/winner-candidates`),
    enabled: Boolean(challengeId),
    staleTime: 20_000
  });

  const payload = data?.ok ? data.data : null;
  const slots = mode === "one" ? oneWinner : mode === "two" ? twoWinners : threeWinners;
  const candidates = payload?.candidates ?? [];
  const candidatesById = useMemo(() => new Map(candidates.map((candidate) => [candidate.submissionId, candidate])), [candidates]);
  const duplicateSelection = new Set(Object.values(selected).filter(Boolean)).size !== Object.values(selected).filter(Boolean).length;
  const allFilled = slots.every((slot) => selected[slot.placement]);
  const approved = payload?.activeProposal?.status === "approved";
  const canSubmit = Boolean(payload?.readiness.ready && !approved && candidates.length && allFilled && !duplicateSelection);
  useEffect(() => {
    const proposal = payload?.activeProposal;
    if (!proposal || initializedProposalId.current === proposal.id || !proposal.winners?.length) return;
    initializedProposalId.current = proposal.id;
    setMode(proposal.winners.length === 1 ? "one" : proposal.winners.length === 2 ? "two" : "three");
    setSelected(Object.fromEntries(proposal.winners.map((winner) => [winner.placement, winner.submissionId ?? ""])));
    setNotes(proposal.notes ?? "");
  }, [payload?.activeProposal]);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setNotice("");
    const winners = slots.map((slot) => {
      const candidate = candidatesById.get(selected[slot.placement]);
      return {
        userId: candidate?.userId,
        submissionId: candidate?.submissionId,
        placement: slot.placement,
        splitPercent: slot.splitPercent
      };
    });
    const result = await apiRequest<{ proposal: { id: string; status: string } }>(`/api/challenges/${challengeId}/winner-proposals`, {
      method: "POST",
      body: JSON.stringify({ winners, notes })
    });
    setSubmitting(false);
    setNotice(result.message);
    if (result.ok) void refetch();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="Propose Winners" subtitle="Submit real challenge winners for admin review. This does not create ledger entries, release funds, or execute payouts." icon={<Trophy />} />
          <LinkButton href={`/challenges/${challengeId}`} variant="secondary">Back to Challenge</LinkButton>
        </div>

        {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-40 animate-pulse" />)}</div> : null}
        {data && !data.ok ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold)]">Winner proposal unavailable</h2><p className="mt-2 text-slate-300">{data.message}</p></Card> : null}

        {payload ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Card className="p-5 sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Challenge</p>
                <h2 className="mt-2 text-2xl font-black">{payload.challenge.title}</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Mini label="Lifecycle" value={label(payload.readiness.lifecycle.primaryStatus)} />
                  <Mini label="Submissions" value={label(payload.readiness.lifecycle.submissionStatus)} />
                  <Mini label="Voting" value={label(payload.readiness.lifecycle.votingStatus)} />
                  <Mini label="Participants" value={payload.challenge.participantCount.toLocaleString()} />
                  <Mini label="Submission Count" value={payload.challenge.submissionCount.toLocaleString()} />
                  <Mini label="Proposal Status" value={payload.activeProposal ? label(payload.activeProposal.status) : "None active"} />
                </div>
                {!payload.readiness.ready ? <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/[0.04] p-4 text-sm text-yellow-100">{payload.readiness.message}</p> : null}
                 {payload.activeProposal ? <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/[0.04] p-4 text-sm text-yellow-100">Proposal status: {label(payload.activeProposal.status)}. {approved ? "Official winners are locked." : "You can revise this proposal until admin approval."}{payload.activeProposal.adminNote ? ` Admin response: ${payload.activeProposal.adminNote}` : ""}</p> : null}
              </Card>

              <Card className="p-5 sm:p-6">
                <h2 className="text-xl font-black">Winner mode</h2>
                 <div className="mt-4 grid gap-3 sm:grid-cols-3">
                   <Button variant={mode === "one" ? "primary" : "secondary"} onClick={() => { setMode("one"); setSelected({}); }}>One winner / 100%</Button>
                   <Button variant={mode === "two" ? "primary" : "secondary"} onClick={() => { setMode("two"); setSelected({}); }}>Two winners / 70-30</Button>
                   <Button variant={mode === "three" ? "primary" : "secondary"} onClick={() => { setMode("three"); setSelected({}); }}>Three winners / 50-30-20</Button>
                </div>
              </Card>

              {candidates.length ? <Card className="p-5 sm:p-6">
                <h2 className="text-xl font-black">Select winners</h2>
                <div className="mt-5 space-y-4">
                  {slots.map((slot) => <Field key={slot.placement} label={`${slot.placement === 1 ? "1st" : slot.placement === 2 ? "2nd" : "3rd"} place - ${slot.splitPercent}%`}>
                    <select className="min-h-12 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4 py-3 text-base text-white outline-none focus:border-[var(--gold)]" value={selected[slot.placement] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [slot.placement]: event.target.value }))}>
                      <option value="">Choose an eligible submission</option>
                      {candidates.map((candidate) => <option key={candidate.submissionId} value={candidate.submissionId}>{candidate.displayName} - {candidate.title} ({candidate.weightedVoteCount} weighted votes)</option>)}
                    </select>
                  </Field>)}
                </div>
                {duplicateSelection ? <p className="mt-4 text-sm text-red-200">Each placement must use a different winner.</p> : null}
              </Card> : <Card><EmptyState icon={<ClipboardCheck />} title="No eligible submissions yet." body={payload.noEligibleCandidatesMessage ?? "Winner candidates will appear after real eligible submissions are available."} /></Card>}

              <Card className="p-5 sm:p-6">
                <Field label="Operator note">
                  <textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for admin review. Do not include private payment or identity details." />
                </Field>
                 <Button className="mt-5 w-full" onClick={() => void submit()} disabled={!canSubmit || submitting}>{submitting ? "Submitting..." : payload.activeProposal ? "Update Winners for Admin Review" : "Submit Winners for Admin Review"}</Button>
                {notice ? <p className="mt-4 text-sm text-slate-300">{notice}</p> : null}
              </Card>
            </div>

            <aside className="space-y-5">
              <Card className="p-5">
                <h2 className="text-xl font-black">Split preview</h2>
                <div className="mt-4 space-y-3">
                  {slots.map((slot) => <div key={slot.placement} className="flex justify-between rounded-[8px] bg-white/[0.03] p-3 text-sm"><span>{slot.placement === 1 ? "1st" : slot.placement === 2 ? "2nd" : "3rd"} place</span><span className="font-black text-[var(--gold)]">{slot.splitPercent}%</span></div>)}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-400">Admin approval is required. Ledger finalization uses confirmed payment sources only, applies a 24-hour hold, and keeps payout processing under review.</p>
              </Card>
              <Card className="p-5">
                <h2 className="text-xl font-black">Proposal states</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">Draft, Pending Admin Review, Approved, Rejected, and Changes Requested are supported. Proposal submission does not mean payout approval.</p>
              </Card>
            </aside>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-white/[0.03] p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-black">{value}</p></div>;
}
