import { AdminShell } from "@/components/admin/admin-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { WalletCards } from "lucide-react";

export default function AdminFinancePage() {
  return <AdminShell>
    <PageTitle title="Finance Review" subtitle="Review settlements, withdrawals, holds, refunds, sponsor funds, and ledger activity before any manual payout step." icon={<WalletCards />} />
    <Card className="mt-8"><EmptyState icon={<WalletCards />} title="No finance review items" body="Sensitive payment and payout records will appear here when they require review." action={<LinkButton href="/admin/finance/sandbox" variant="secondary">Sandbox Controls</LinkButton>} /></Card>
  </AdminShell>;
}
