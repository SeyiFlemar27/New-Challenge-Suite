"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type PrizeProposal = {
  id: string;
  challengeId?: string;
  challengeTitle?: string;
  status?: string;
  proposedByUserId?: string;
  proposedByRole?: string;
  winners?: Array<{ userId?: string; placement?: number; splitPercent?: number; proposedAmountPreviewCents?: number }>;
  ledgerFinalizationStatus?: string;
  ledgerEntriesCreated?: boolean;
  payoutProviderCalled?: boolean;
  submittedAt?: string;
};

function friendly(value: unknown) {
  return String(value ?? "not available").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(cents: unknown) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminPrizeApprovalsPage() {
  const [proposals, setProposals] = useState<PrizeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const result = await apiRequest<{ proposals: PrizeProposal[]; emptyState?: string | null }>("/api/admin/prize-approvals");
    setLoading(false);
    if (!result.ok || !result.data) {
      setNotice(result.message);
      return;
    }
    setProposals(result.data.proposals ?? []);
    setNotice(result.data.emptyState ?? "");
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageTitle
        title="Prize Approvals"
        subtitle="Review proposed challenge winners and payout previews. Approval does not execute payouts or mark funds paid."
        icon={<ShieldCheck />}
      />

      <Card className="mt-6 border-yellow-500/20 bg-yellow-500/[0.03] p-5 text-sm leading-6 text-slate-300">
        Admin approval is required before prize ledger finalization can proceed. Winner funds remain pending, a 24-hour hold applies, and payout providers are not connected from this page.
      </Card>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {notice ? <Card className="mt-6 border-white/10 p-5 text-sm text-slate-300">{notice}</Card> : null}

      {loading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-40 animate-pulse" />)}</div> : null}

      {!loading && proposals.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={<ClipboardCheck />} title="No prize approvals pending." body="Winner proposals submitted from real challenge records will appear here for admin review." />
        </Card>
      ) : null}

      {!loading && proposals.length ? (
        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {proposals.map((proposal) => {
            const winners = Array.isArray(proposal.winners) ? proposal.winners : [];
            return (
              <Card key={proposal.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Pending Admin Review</p>
                    <h2 className="mt-2 text-xl font-black">{proposal.challengeTitle || proposal.challengeId || "Challenge"}</h2>
                    <p className="mt-1 break-all text-xs text-slate-500">{proposal.id}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-slate-300">{friendly(proposal.status)}</span>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold text-slate-500">Proposed By</dt><dd className="mt-1 text-sm font-bold">{friendly(proposal.proposedByRole)} {proposal.proposedByUserId ? `(${proposal.proposedByUserId})` : ""}</dd></div>
                  <div className="rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold text-slate-500">Ledger State</dt><dd className="mt-1 text-sm font-bold">{friendly(proposal.ledgerFinalizationStatus)}</dd></div>
                  <div className="rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold text-slate-500">Ledger Entries Created</dt><dd className="mt-1 text-sm font-bold">{proposal.ledgerEntriesCreated ? "Yes" : "No"}</dd></div>
                  <div className="rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold text-slate-500">Payout Provider Called</dt><dd className="mt-1 text-sm font-bold">{proposal.payoutProviderCalled ? "Yes" : "No"}</dd></div>
                </dl>
                <div className="mt-5 rounded-[8px] border border-white/10 p-4">
                  <p className="text-sm font-black">Proposed winners</p>
                  {winners.length ? <div className="mt-3 space-y-2">{winners.map((winner, index) => <div key={`${proposal.id}_${winner.userId}_${index}`} className="flex flex-wrap justify-between gap-2 text-sm text-slate-300"><span>Place {winner.placement ?? index + 1}: {winner.userId ?? "Winner unavailable"}</span><span>{winner.splitPercent ?? 0}% / {money(winner.proposedAmountPreviewCents)}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Winner details are unavailable on this proposal.</p>}
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-400">Use the admin prize approval API to preview, approve, reject, or request changes. Approved records remain non-paying until confirmed revenue, ledger finalization, hold, and payout provider requirements are complete.</p>
                <LinkButton href={`/admin/prize-approvals/${proposal.id}`} className="mt-5 w-full">Review Proposal</LinkButton>
              </Card>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
