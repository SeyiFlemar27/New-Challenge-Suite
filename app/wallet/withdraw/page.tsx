"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type WithdrawalRecord = {
  id: string;
  amountCents: number;
  currency: string;
  payoutMethodLabel?: string;
  status: string;
  kycStatus?: string;
  createdAt?: string;
  reason?: string | null;
};

type WithdrawalData = {
  wallet: {
    availableBalanceCents: number;
    pendingBalanceCents: number;
    underReviewBalanceCents: number;
    withdrawnBalanceCents: number;
    failedWithdrawalBalanceCents: number;
    lifetimeEarningsCents: number;
    currency: string;
  };
  requests: WithdrawalRecord[];
  minimumWithdrawalCents: number | null;
  kycProcessingActive: false;
  automaticPayoutsActive: false;
  withdrawalRequestCreationEnabled: boolean;
  payoutMethodCollectionEnabled: boolean;
  payoutProviderConfigured: boolean;
  kycStatus: string;
  disabledReasons: string[];
  policy?: { withdrawalsSetupRequired?: string; dorocoinNotCash?: string; rewardPointsNotCash?: string };
  accountType: string;
  eligibilitySourceTypes: string[];
};

export default function WithdrawPage() {
  const [data, setData] = useState<WithdrawalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const result = await apiRequest<WithdrawalData>("/api/withdrawals");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    setData(result.data);
  }

  useEffect(() => { void load(); }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <LinkButton href="/wallet" variant="ghost"><ArrowLeft size={17} /> Back to Wallet</LinkButton>
        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle title="Withdraw eligible earnings" subtitle="Only verified winnings and approved earnings can be submitted for withdrawal review." icon={<Landmark />} />
          <span className="rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-4 py-2 text-xs font-black uppercase text-[var(--gold)]">Manual review only</span>
        </div>

        {notice ? <Card className="mt-6 border-yellow-500/20 p-4 text-sm text-slate-200">{notice}</Card> : null}
        {loading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-28 animate-pulse" />)}</div> : null}
        {data ? <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Balance label="Available" value={data.wallet.availableBalanceCents} />
            <Balance label="Pending" value={data.wallet.pendingBalanceCents} />
            <Balance label="Under review" value={data.wallet.underReviewBalanceCents} />
            <Balance label="Withdrawn history" value={data.wallet.withdrawnBalanceCents} />
            <Balance label="Lifetime earnings" value={data.wallet.lifetimeEarningsCents} />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
            <Card className="p-6 sm:p-8">
              <h2 className="text-2xl font-black">Withdrawal architecture</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{data.policy?.withdrawalsSetupRequired ?? "Withdrawals are not configured yet. KYC, payout method setup, admin review, and payout provider integration are required before requests can be created."}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Requirement label="KYC status" value={data.kycStatus} complete={data.kycStatus === "verified"} />
                <Requirement label="Payout provider" value={data.payoutProviderConfigured ? "Configured" : "Not configured"} complete={data.payoutProviderConfigured} />
                <Requirement label="Payout method setup" value={data.payoutMethodCollectionEnabled ? "Available" : "Not available"} complete={data.payoutMethodCollectionEnabled} />
                <Requirement label="Available balance" value={data.wallet.availableBalanceCents > 0 ? "Available" : "No balance"} complete={data.wallet.availableBalanceCents > 0} />
              </div>
              <button className="mt-6 min-h-12 w-full rounded-[8px] border border-white/10 bg-white/[0.03] px-5 text-sm font-black text-slate-500" disabled>Request Withdrawal - setup required</button>
              {data.disabledReasons.length ? <div className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4"><p className="text-sm font-black text-yellow-100">Blocked requirements</p><ul className="mt-2 space-y-1 text-sm text-yellow-50/80">{data.disabledReasons.map((reason) => <li key={reason}>- {reason.replaceAll("_", " ")}</li>)}</ul></div> : null}
            </Card>
            <Card className="p-6 sm:p-8">
              <ShieldCheck className="text-[var(--gold)]" size={34} />
              <h2 className="mt-5 text-2xl font-black">Review and identity checks</h2>
              <p className="mt-4 leading-7 text-slate-300">Sumsub identity verification must be verified before withdrawals can be approved for payout. Bank verification and payout providers are not connected yet.</p>
              <div className="mt-6 space-y-3 text-sm text-slate-400">
                <p>{data.policy?.dorocoinNotCash ?? "DoroCoins are platform credits and cannot be withdrawn or converted to cash."}</p>
                <p>{data.policy?.rewardPointsNotCash ?? "Reward points are not cash and cannot be withdrawn."}</p>
                <p>Withdrawals require admin review before payout.</p>
                <p>No automatic or instant payout is available.</p><p><a className="font-bold text-[var(--gold)]" href="/kyc/status">Review KYC status</a></p>
              </div>
            </Card>
          </div>
          <section className="mt-10">
            <h2 className="text-2xl font-black">Withdrawal history</h2>
            <Card className="mt-5 overflow-hidden">
              {data.requests.length ? data.requests.map((record) => <div key={record.id} className="grid gap-2 border-b border-white/10 p-5 md:grid-cols-[130px_1fr_150px_150px]">
                <span className="text-sm text-slate-400">{record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "Pending"}</span>
                <span className="font-bold">{record.payoutMethodLabel ?? "Payout method under review"}</span>
                <span className="font-black text-[var(--gold)]">${(record.amountCents / 100).toFixed(2)} {record.currency}</span>
                <span className="capitalize text-slate-300">{record.status.replaceAll("_", " ")}</span>
              </div>) : <EmptyState icon={<Landmark />} title="No withdrawal requests" body="Your review requests and status updates will appear here." />}
            </Card>
          </section>
        </> : null}
      </div>
    </AppShell>
  );
}

function Balance({ label, value }: { label: string; value: number }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-[var(--gold)]">${(Number(value || 0) / 100).toFixed(2)}</p></Card>;
}

function Requirement({ label, value, complete }: { label: string; value: string; complete: boolean }) {
  return <div className={`rounded-[8px] border p-4 ${complete ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]"}`}><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-2 font-black ${complete ? "text-emerald-200" : "text-slate-300"}`}>{value.replaceAll("_", " ")}</p></div>;
}
