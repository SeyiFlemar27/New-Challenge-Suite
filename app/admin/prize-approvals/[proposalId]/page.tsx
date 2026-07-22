"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, FileClock, XCircle } from "lucide-react";
import { Button, Card, EmptyState, Field, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type DetailPayload = {
  proposal: Record<string, any>;
  challenge: Record<string, any> | null;
  validation: { valid: boolean; totalPercent: number; errors: Record<string, string> };
  preview: Record<string, any> | null;
  readiness: { ready: boolean; message: string } | null;
};

function label(value: unknown) {
  return String(value ?? "not available").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(cents: unknown) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminPrizeApprovalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const [adminNote, setAdminNote] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-prize-approval", proposalId],
    queryFn: () => apiRequest<DetailPayload>(`/api/admin/prize-approvals/${proposalId}`),
    enabled: Boolean(proposalId),
    staleTime: 15_000
  });
  const detail = data?.ok ? data.data : null;
  const proposal = detail?.proposal;
  const challenge = detail?.challenge;
  const preview = detail?.preview;
  const challengeId = String(proposal?.challengeId ?? "");

  async function action(kind: "approve" | "reject" | "request-changes" | "finalize-ledger") {
    if (!proposal || !challengeId) return;
    if ((kind === "reject" || kind === "request-changes") && !adminNote.trim()) {
      setNotice("Admin note is required for this action.");
      return;
    }
    setSubmitting(kind);
    setNotice("");
    const path = kind === "finalize-ledger"
      ? `/api/admin/challenges/${challengeId}/winner-proposals/${proposal.id}/finalize-ledger`
      : `/api/admin/challenges/${challengeId}/winner-proposals/${proposal.id}/${kind}`;
    const result = await apiRequest(path, { method: "POST", body: JSON.stringify({ adminNote }) });
    setSubmitting("");
    setNotice(result.message);
    if (result.ok) void refetch();
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Prize Approval Detail" subtitle="Review proposed winners, payout preview, and ledger readiness. Actions remain server-authorized and non-paying." icon={<ClipboardCheck />} />
        <LinkButton href="/admin/prize-approvals" variant="secondary">Back to Queue</LinkButton>
      </div>

      {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-40 animate-pulse" />)}</div> : null}
      {data && !data.ok ? <Card className="mt-8"><EmptyState icon={<FileClock />} title="Prize approval not found" body={data.message} action={<LinkButton href="/admin/prize-approvals">Back to Queue</LinkButton>} /></Card> : null}

      {detail && proposal ? <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_390px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Challenge Overview</p>
            <h2 className="mt-2 text-2xl font-black">{String(challenge?.title ?? proposal.challengeTitle ?? "Challenge")}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Data label="Category" value={challenge?.category ?? "Not available"} />
              <Data label="Lifecycle" value={challenge?.lifecycleStatus ?? challenge?.status ?? "Not available"} />
              <Data label="Owner / Operator" value={challenge?.operatorId ?? challenge?.hostId ?? challenge?.creatorId ?? "Not available"} />
              <Data label="Participants" value={challenge?.participantCount ?? challenge?.participants ?? 0} />
              <Data label="Submissions" value={challenge?.submissionCount ?? 0} />
              <Data label="Voting Closes" value={challenge?.votingDeadline ?? challenge?.votingEndsAt ?? "Not available"} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Proposal Summary</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Data label="Status" value={proposal.status} />
              <Data label="Proposed By" value={`${label(proposal.proposedByRole)} ${proposal.proposedByUserId ?? ""}`} />
              <Data label="Proposed Date" value={proposal.submittedAt ?? proposal.createdAt ?? "Not available"} />
              <Data label="Updated" value={proposal.updatedAt ?? "Not available"} />
              <Data label="Ledger Status" value={proposal.ledgerFinalizationStatus ?? "not_started"} />
              <Data label="Admin Decision" value={proposal.adminDecision ?? "Not reviewed"} />
            </div>
            {proposal.notes ? <p className="mt-5 rounded-[8px] bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">Operator note: {proposal.notes}</p> : null}
            {proposal.adminNote ? <p className="mt-5 rounded-[8px] bg-yellow-500/[0.04] p-4 text-sm leading-6 text-yellow-100">Admin note: {proposal.adminNote}</p> : null}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-black">Proposed winners</h2>
            <div className="mt-5 space-y-3">
              {Array.isArray(proposal.winners) && proposal.winners.length ? proposal.winners.map((winner: any, index: number) => <div key={`${winner.userId}_${index}`} className="grid gap-3 rounded-[8px] bg-white/[0.03] p-4 sm:grid-cols-4">
                <Data label="Placement" value={winner.placement ?? index + 1} />
                <Data label="Winner" value={winner.userId ?? "Not available"} />
                <Data label="Submission" value={winner.submissionId ?? "Not available"} />
                <Data label="Split" value={`${winner.splitPercent ?? 0}%`} />
              </div>) : <p className="text-sm text-slate-400">No proposed winners are stored on this proposal.</p>}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-black">Ledger preview</h2>
            {preview ? <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Data label="Entry Fee Winner Share" value={money(preview.confirmedEntryFeeWinnerShareCents)} />
              <Data label="Paid Vote Winner Share" value={money(preview.confirmedPaidVoteWinnerShareCents)} />
              <Data label="Sponsor Winner Share" value={money(preview.confirmedSponsorContributionWinnerShareCents)} />
              <Data label="Total Prize Pool" value={money(preview.totalWinnerPrizePoolCents)} />
              <Data label="Creator / Host Share" value={money(preview.creatorHostOperatorShareCents)} />
              <Data label="Platform / Admin Share" value={money(preview.platformAdminShareCents)} />
              <Data label="Currency" value={preview.currency} />
              <Data label="Hold Until" value={preview.holdUntil ?? "Not available"} />
            </div> : <p className="mt-4 text-sm text-slate-400">Confirmed revenue is currently unavailable or $0 until payment confirmation is connected.</p>}
            {preview && !preview.ledgerFinalizationAvailable ? <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/[0.04] p-4 text-sm text-yellow-100">Confirmed revenue is currently unavailable or $0 until payment confirmation is connected.</p> : null}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-black">Readiness checklist</h2>
            <div className="mt-4 space-y-2">
              <Check label="Challenge ended" ok={Boolean(detail.readiness?.ready)} />
              <Check label="Voting closed" ok={Boolean(detail.readiness?.ready)} />
              <Check label="Split equals 100%" ok={Boolean(detail.validation.valid)} />
              <Check label="No duplicate winners/placements" ok={Boolean(detail.validation.valid)} />
              <Check label="Confirmed payment sources available" ok={Boolean(preview?.ledgerFinalizationAvailable)} />
              <Check label="KYC required before withdrawal" ok={Boolean(preview?.kycRequiredBeforeWithdrawal)} />
              <Check label="24-hour hold required" ok={Boolean(preview?.holdUntil)} />
              <Check label="Payout provider inactive" ok={preview?.providerPayoutCalled === false || proposal.payoutProviderCalled === false} />
            </div>
          </Card>

          <Card className="p-5">
            <Field label="Admin note">
              <textarea className={textareaClass} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Required for reject or request changes." />
            </Field>
            <div className="mt-5 grid gap-3">
              <Button onClick={() => void action("approve")} disabled={Boolean(submitting) || proposal.status === "approved"}><CheckCircle2 size={17} /> {submitting === "approve" ? "Approving..." : "Approve Proposal"}</Button>
              <Button variant="secondary" onClick={() => void action("request-changes")} disabled={Boolean(submitting)}>{submitting === "request-changes" ? "Saving..." : "Request Changes"}</Button>
              <Button variant="secondary" onClick={() => void action("reject")} disabled={Boolean(submitting)}><XCircle size={17} /> {submitting === "reject" ? "Rejecting..." : "Reject Proposal"}</Button>
              <Button variant="ghost" onClick={() => void action("finalize-ledger")} disabled={Boolean(submitting) || proposal.status !== "approved"}>{submitting === "finalize-ledger" ? "Checking..." : "Finalize Ledger Foundation"}</Button>
            </div>
            {notice ? <p className="mt-4 text-sm leading-6 text-slate-300">{notice}</p> : null}
            <p className="mt-5 text-xs leading-5 text-slate-500">Approving confirms the proposed winners for admin review. Funds remain subject to confirmed payment sources, ledger finalization, 24-hour hold, KYC, and payout provider setup.</p>
          </Card>
          {challengeId ? <Link href={`/challenges/${challengeId}`} className="block rounded-[8px] border border-white/10 p-4 text-sm font-bold text-[var(--gold)]">Open challenge reference</Link> : null}
        </aside>
      </div> : null}
    </>
  );
}

function Data({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 rounded-[8px] bg-white/[0.03] p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-black">{typeof value === "number" ? value.toLocaleString() : label === "Status" || label.includes("Lifecycle") || label.includes("Decision") || label.includes("Ledger") ? labelValue(value) : String(value ?? "Not available")}</p></div>;
}

function labelValue(value: unknown) {
  return label(value);
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-[8px] bg-white/[0.03] p-3 text-sm"><span>{label}</span><span className={ok ? "font-black text-emerald-300" : "font-black text-yellow-200"}>{ok ? "Ready" : "Setup required"}</span></div>;
}
