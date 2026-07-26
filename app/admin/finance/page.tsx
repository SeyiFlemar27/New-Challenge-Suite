import { AdminShell } from "@/components/admin/admin-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { WalletCards } from "lucide-react";

export default function AdminFinancePage() {
  return <AdminShell>
    <PageTitle title="Finance Foundation" subtitle="Ledger, provider-event, withdrawal, hold, and sandbox controls are foundation-only. Production money movement is not active." icon={<WalletCards />} />
    <Card className="mt-8"><EmptyState icon={<WalletCards />} title="No finance review queue yet." body="No fake balances, fake transactions, fake payouts, or fake sponsor funding are displayed." action={<LinkButton href="/admin/finance/sandbox" variant="secondary">Sandbox Foundation</LinkButton>} /></Card>
  </AdminShell>;
}
