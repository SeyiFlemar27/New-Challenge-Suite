import { Card, PageTitle } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function AdminFinanceSandboxPage() {
  return <>
    <PageTitle title="Financial Sandbox" subtitle="Sandbox controls are blocked in production and must be event-driven. Arbitrary Set Balance controls are not available." icon={<ShieldCheck />} />
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {["Confirm Test Prize Funding", "Advance Winner Settlement", "Approve Test KYC", "Confirm Test Payout", "Create Test Chargeback", "Place Test Financial Hold"].map((action) => <Card key={action} className="p-5"><p className="font-black">{action}</p><p className="mt-2 text-sm leading-6 text-slate-400">Available only outside production after finance permission, ledger, and audit checks pass.</p></Card>)}
    </div>
  </>;
}
