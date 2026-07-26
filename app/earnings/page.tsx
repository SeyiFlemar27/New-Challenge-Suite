import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { WalletCards } from "lucide-react";

export default function EarningsPage() {
  return <AppShell>
    <PageTitle title="Earnings" subtitle="Real-money earnings are separate from DoroCoin, spin points, reward credits, and other virtual platform value." icon={<WalletCards />} />
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {["Available", "Pending", "Reserved", "Paid Out", "Negative Balance"].map((label) => <Card key={label} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-3 text-2xl font-black">$0.00</p><p className="mt-2 text-xs leading-5 text-slate-500">Shown from ledger-derived backend data only.</p></Card>)}
    </div>
    <Card className="mt-6 p-5 text-sm leading-6 text-slate-300">DoroCoins are not cash, cannot be withdrawn, and cannot be converted to cash. Withdrawals require KYC, payout method setup, cleared holds, no risk blocks, and provider integration.</Card>
    <div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/earnings/transactions" variant="secondary">View Transactions</LinkButton><LinkButton href="/earnings/withdraw">Withdraw Setup</LinkButton></div>
  </AppShell>;
}
