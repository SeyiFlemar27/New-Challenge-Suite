import { CircleDollarSign, Clock3, ShieldCheck, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";

const earningTypes = [
  { title: "Challenge winner prizes", body: "Admin-approved challenge settlement credits appear as their own earning source. Normal winner-pool credits are not charged a second settlement fee." },
  { title: "Sponsor-funded prizes", body: "Sponsor prize credits show the confirmed gross amount, the single sponsor-prize platform fee, and the net internal credit." },
  { title: "Creator earnings", body: "Creator earnings come from confirmed challenge-generated revenue only. Sponsor-funded prize money is excluded." },
  { title: "Prediction rewards", body: "Confirmed Prediction Arena rewards appear separately after approved results and internal settlement." }
];

export default function EarningsHelpPage() {
  return <AppShell><div className="mx-auto max-w-5xl">
    <PageTitle title="Understanding Earnings" subtitle="How recorded cash earnings move from pending review to an available internal balance." icon={<CircleDollarSign className="text-[var(--gold)]" />} />
    <Card className="mt-7 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6"><div className="flex gap-4"><ShieldCheck className="shrink-0 text-[var(--gold)]" /><div><h2 className="text-xl font-black">Provider-confirmed records only</h2><p className="mt-2 text-sm leading-6 text-slate-300">Challenge Suite does not create earnings from pending checkout pages, typed amounts, DoroCoins, Challenge Credits, or Growth Wallet activity. Payment confirmation and settlement review remain server enforced.</p></div></div></Card>
    <section className="mt-8 grid gap-4 md:grid-cols-2">{earningTypes.map((item) => <Card key={item.title} className="p-6"><h2 className="text-xl font-black">{item.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{item.body}</p></Card>)}</section>
    <section className="mt-8 grid gap-5 lg:grid-cols-2"><Card className="p-6"><Clock3 className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Pending and available</h2><p className="mt-3 text-sm leading-6 text-slate-400">Pending earnings are still inside approval, hold, reconciliation, or provider-review windows. Available earnings have completed the internal checks shown on the withdrawal flow. External payout is never implied by an available internal balance.</p></Card><Card className="p-6"><WalletCards className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Withdrawal readiness</h2><p className="mt-3 text-sm leading-6 text-slate-400">Identity verification, the displayed minimum, any applicable first-withdrawal hold, destination review, and operational approval must all pass. The withdrawal page is the source of truth for your current blockers.</p></Card></section>
    <Card className="mt-8 p-6"><h2 className="text-xl font-black">Need help with a recorded earning?</h2><p className="mt-2 text-sm text-slate-400">Include the challenge or transaction reference. Never include passwords, provider secrets, or full payment credentials.</p><div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/earnings">Back to Earnings</LinkButton><LinkButton href="/support/new" variant="secondary">Contact Support</LinkButton></div></Card>
  </div></AppShell>;
}
