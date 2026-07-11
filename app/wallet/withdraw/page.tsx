"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
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
    currency: string;
  };
  requests: WithdrawalRecord[];
  minimumWithdrawalCents: number;
  kycProcessingActive: false;
  automaticPayoutsActive: false;
  accountType: string;
  eligibilitySourceTypes: string[];
};

const initialForm = { amount: "", accountHolderName: "", bankName: "", accountNumber: "" };

export default function WithdrawPage() {
  const [data, setData] = useState<WithdrawalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await apiRequest<WithdrawalData>("/api/withdrawals");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    setData(result.data);
  }

  useEffect(() => { void load(); }, []);

  async function submit() {
    if (!data || !window.confirm("Submit this withdrawal request for admin review? No money will move automatically.")) return;
    setSubmitting(true);
    setNotice("");
    const result = await apiRequest("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        amountCents: Math.round(Number(form.amount) * 100),
        accountHolderName: form.accountHolderName,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        payoutMethodType: "bank",
        sourceType: data.eligibilitySourceTypes[0] ?? "prize_winnings",
        idempotencyKey: crypto.randomUUID()
      })
    });
    setSubmitting(false);
    setNotice(result.message);
    if (result.ok) {
      setForm(initialForm);
      await load();
    }
  }

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
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
            <Card className="p-6 sm:p-8">
              <h2 className="text-2xl font-black">Request withdrawal review</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Minimum request: ${(data.minimumWithdrawalCents / 100).toFixed(2)}. The amount is reserved from available balance while review is pending.</p>
              {data.wallet.availableBalanceCents < data.minimumWithdrawalCents ? <Card className="mt-6 border-dashed p-5"><EmptyState icon={<Landmark />} title="No withdrawable balance yet" body="Eligible prize winnings and approved earnings will appear here after review." /></Card> : <div className="mt-6 space-y-5">
                <Field label="Amount (USD)"><input className={inputClass} inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="25.00" /></Field>
                <Field label="Account holder name"><input className={inputClass} value={form.accountHolderName} onChange={(event) => setForm({ ...form, accountHolderName: event.target.value })} /></Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Bank or institution"><input className={inputClass} value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></Field>
                  <Field label="Account number"><input className={inputClass} autoComplete="off" value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value.replace(/\D/g, "") })} /></Field>
                </div>
                <Button className="w-full" onClick={submit} disabled={submitting}>{submitting ? "Submitting for Review..." : "Request Withdrawal"}</Button>
              </div>}
            </Card>
            <Card className="p-6 sm:p-8">
              <ShieldCheck className="text-[var(--gold)]" size={34} />
              <h2 className="mt-5 text-2xl font-black">Review and identity checks</h2>
              <p className="mt-4 leading-7 text-slate-300">Sumsub identity verification must be verified before withdrawals can be approved for payout. Bank verification and payout providers are not connected yet.</p>
              <div className="mt-6 space-y-3 text-sm text-slate-400">
                <p>DoroCoins are platform credits and cannot be withdrawn or converted to cash.</p>
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

