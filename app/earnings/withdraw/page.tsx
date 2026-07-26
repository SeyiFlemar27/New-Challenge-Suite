import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function EarningsWithdrawPage() {
  return <AppShell>
    <PageTitle title="Withdraw Earnings" subtitle="Withdrawal requests remain setup-safe until KYC, payout method setup, holds, risk review, and payout provider integration are complete." icon={<ShieldCheck />} />
    <Card className="mt-8 p-5 text-sm leading-6 text-slate-300">KYC required before withdrawal. Payout method required before withdrawal. Active holds, negative balances, disputes, and insufficient available balance block withdrawal. No payout provider is called from this page.</Card>
  </AppShell>;
}
