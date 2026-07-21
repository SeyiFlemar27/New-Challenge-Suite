import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import { CHALLENGER_VOTE_REVENUE_BONUS_PERCENT, GENERATED_REVENUE_SPLIT, PREDICTION_PLATFORM_FEE_PERCENT } from "@/lib/server/revenue-sharing";
import { PLATFORM_FEE_CONFIG } from "@/lib/server/wallet-architecture";
import { BarChart3, ShieldCheck } from "lucide-react";

export default function RevenueSharePage() {
  return (
    <AppShell>
      <PageTitle title="Revenue Share Foundation" subtitle="Generated revenue is tracked separately from initial prize pools. All releases require admin review and verified KYC where legally required." icon={<BarChart3 />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Generated Revenue Split Rules</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Share label="Winners" percent={`${GENERATED_REVENUE_SPLIT.winnersPercent}%`} />
            <Share label="Host" percent={`${GENERATED_REVENUE_SPLIT.hostPercent}%`} />
            <Share label="Sponsor" percent={`${GENERATED_REVENUE_SPLIT.sponsorPercent}%`} />
            <Share label="Platform" percent={`${GENERATED_REVENUE_SPLIT.platformPercent}%`} />
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">Gross-to-net accounting will subtract provider fees, platform fees, and any refund/dispute reserve before allocation. Missing product percentages remain setup-required business decisions.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <Rule label="Prediction Arena platform fee" value={`${PREDICTION_PLATFORM_FEE_PERCENT}%`} />
            <Rule label="Creator challenge platform fee" value={PLATFORM_FEE_CONFIG.creatorChallengePlatformFeePercent === null ? "Business decision required" : `${PLATFORM_FEE_CONFIG.creatorChallengePlatformFeePercent}%`} />
            <Rule label="Host event platform fee" value={PLATFORM_FEE_CONFIG.hostEventPlatformFeePercent === null ? "Business decision required" : `${PLATFORM_FEE_CONFIG.hostEventPlatformFeePercent}%`} />
            <Rule label="Sponsorship platform fee" value={PLATFORM_FEE_CONFIG.sponsorshipPlatformFeePercent === null ? "Business decision required" : `${PLATFORM_FEE_CONFIG.sponsorshipPlatformFeePercent}%`} />
          </div>
        </Card>
        <Card className="p-6">
          <ShieldCheck className="text-[var(--gold)]" />
          <h2 className="mt-4 text-xl font-black">Safety Rules</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Initial prize money and sponsor prize money remain separate and go 100% to winners after review. This page does not release funds, execute payouts, execute withdrawals, or release sponsor money. Sumsub KYC must be verified before any future identity-sensitive release or withdrawal review can progress.</p>
          <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Challenger vote-revenue bonus rule: {CHALLENGER_VOTE_REVENUE_BONUS_PERCENT}% of eligible vote revenue can be recorded for pending admin review when the earning source is provider-confirmed.</p>
        </Card>
      </div>
    </AppShell>
  );
}

function Share({ label, percent }: { label: string; percent: string }) {
  return <Card className="p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold)]">{percent}</p><p className="mt-1 text-sm text-slate-400">Pending review</p></Card>;
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-sm font-black text-white">{value}</p></div>;
}
