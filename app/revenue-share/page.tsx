import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import { calculateChallengerVoteRevenueBonus, calculateGeneratedRevenueSplit } from "@/lib/server/revenue-sharing";
import { BarChart3, ShieldCheck } from "lucide-react";

export default function RevenueSharePage() {
  const example = calculateGeneratedRevenueSplit(1_000_000);
  const bonus = calculateChallengerVoteRevenueBonus(20_000);
  return (
    <AppShell>
      <PageTitle title="Revenue Share Foundation" subtitle="Generated revenue is tracked separately from initial prize pools. All releases require admin review." icon={<BarChart3 />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Generated Revenue Split</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Share label="Winners" value={example.winnersShareCents} percent="65%" />
            <Share label="Host" value={example.hostShareCents} percent="15%" />
            <Share label="Sponsor" value={example.sponsorShareCents} percent="10%" />
            <Share label="Platform" value={example.platformShareCents} percent="10%" />
          </div>
          <p className="mt-5 text-sm text-slate-400">Example uses $10,000 generated revenue. Challenger/entry fees, paid votes, DoroCoin vote-purchase revenue where applicable, challenge-related revenue, and Prediction Arena platform-fee revenue can feed this review ledger.</p>
        </Card>
        <Card className="p-6">
          <ShieldCheck className="text-[var(--gold)]" />
          <h2 className="mt-4 text-xl font-black">Safety Rules</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Initial prize money and sponsor prize money remain separate and go 100% to winners after review. This page does not release funds, execute payouts, execute withdrawals, or release sponsor money.</p>
          <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Challenger vote-revenue bonus example: $200 vote revenue creates a ${Math.round(bonus.challengerVoteRevenueBonusCents / 100)} pending review bonus. It is tracked separately from the 65/15/10/10 split.</p>
        </Card>
      </div>
    </AppShell>
  );
}

function Share({ label, value, percent }: { label: string; value: number; percent: string }) {
  return <Card className="p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold)]">${(value / 100).toLocaleString()}</p><p className="mt-1 text-sm text-slate-400">{percent}</p></Card>;
}
