import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { BadgeCheck, ShieldCheck } from "lucide-react";

const unlocked = ["Premium monetization tools where eligible", "Withdrawal eligibility review", "Real-money Prediction Arena eligibility checks", "Revenue-related review flows"];

export default function KycSuccessPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="p-8 text-center sm:p-10">
          <BadgeCheck className="mx-auto h-16 w-16 text-emerald-400" />
          <h1 className="mt-5 text-4xl font-black">Identity verified</h1>
          <p className="mt-3 text-lg text-slate-300">Your verification has been approved.</p>
          <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
            {unlocked.map((item) => <p key={item} className="flex gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm font-bold text-slate-200"><ShieldCheck className="shrink-0 text-[var(--gold)]" size={18} />{item}</p>)}
          </div>
          <p className="mt-6 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-100">Identity verification does not automatically trigger payouts, withdrawals, refunds, sponsor releases, or prize releases.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><LinkButton href="/dashboard">Go to Dashboard</LinkButton><LinkButton href="/earnings" variant="secondary">View Earnings</LinkButton><LinkButton href="/revenue-share" variant="secondary">View Revenue</LinkButton></div>
        </Card>
      </div>
    </AppShell>
  );
}
