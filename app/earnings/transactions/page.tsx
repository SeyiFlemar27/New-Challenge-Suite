import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { FileText } from "lucide-react";

export default function EarningsTransactionsPage() {
  return <AppShell>
    <PageTitle title="Earnings Transactions" subtitle="Financial transactions will appear only from immutable ledger-backed records and provider-confirmed events." icon={<FileText />} />
    <Card className="mt-8"><EmptyState icon={<FileText />} title="No real-money transactions yet." body="No demo rows, fake payouts, fake sponsor funding, or fake winner earnings are shown." /></Card>
  </AppShell>;
}
