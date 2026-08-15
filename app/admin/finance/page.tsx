"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { WalletCards } from "lucide-react";
import { apiRequest } from "@/lib/api/client";

export default function AdminFinancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-settlements"],
    queryFn: () => apiRequest<{ settlements: any[]; walletCredits: any[]; platformLedger: any[] }>("/api/admin/finance/settlements"),
    staleTime: 15_000
  });
  const payload = data?.ok ? data.data : null;
  const settlements = payload?.settlements ?? [];
  return <>
    <PageTitle title="Finance Review" subtitle="Review settlements, withdrawals, holds, refunds, sponsor funds, and ledger activity before any manual payout step." icon={<WalletCards />} />
    {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1].map((item) => <Card key={item} className="h-44 animate-pulse" />)}</div> : settlements.length ? <div className="mt-8 space-y-5">
      {settlements.map((settlement) => {
        const platformEntries = (payload?.platformLedger ?? []).filter((entry) => entry.settlementId === settlement.id);
        const credits = (payload?.walletCredits ?? []).filter((entry) => entry.settlementId === settlement.id);
        return <Card key={settlement.id} className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Internal Settlement</p><h2 className="mt-2 break-all text-lg font-black">{settlement.challengeId}</h2></div>
            <span className="rounded-[8px] border border-white/10 px-3 py-2 text-xs font-black capitalize">{String(settlement.status ?? "pending_review").replaceAll("_", " ")}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Amount label="Confirmed Challenge Revenue" value={settlement.grossConfirmedChallengeRevenue} />
            <Amount label="Winner Pool (65%)" value={settlement.winnerPoolAmount} />
            <Amount label="Creator / Host (20%)" value={settlement.creatorHostAmount} />
            <Amount label="Platform Fee (15%)" value={settlement.platformChallengeFeeAmount} />
            <Amount label="Gross Sponsor Prize" value={settlement.grossConfirmedSponsorPrizeAmount} />
            <Amount label="Sponsor Prize Platform Fee" value={settlement.sponsorPrizePlatformFeeAmount} />
            <Amount label="Net Sponsor Prize" value={settlement.netSponsorPrizeAmount} />
            <Amount label="Internal Credits" value={credits.reduce((sum: number, item: any) => sum + Number(item.netAmountCents ?? item.amountCents ?? 0), 0)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-slate-400"><span>{credits.length} wallet credits</span><span>{platformEntries.length} platform ledger entries</span><span>No external payout</span></div>
        </Card>;
      })}
    </div> : <Card className="mt-8"><EmptyState icon={<WalletCards />} title="No finance review items" body="Confirmed internal settlements will appear here after admin winner approval." action={<LinkButton href="/admin/prize-approvals" variant="secondary">Prize Approvals</LinkButton>} /></Card>}
  </>;
}

function Amount({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-[8px] bg-white/[0.03] p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">${(Number(value ?? 0) / 100).toFixed(2)}</p></div>;
}
