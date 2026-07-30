"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type WithdrawalRecord = { id: string; amountCents: number; currency: string; payoutMethodLabel?: string; status: string; kycStatus?: string; createdAt?: string; reason?: string | null };
type WithdrawalData = {
  wallet: { availableBalanceCents: number; pendingBalanceCents: number; underReviewBalanceCents: number; withdrawnBalanceCents: number; failedWithdrawalBalanceCents: number; lifetimeEarningsCents: number; currency: string };
  requests: WithdrawalRecord[];
  minimumWithdrawalCents: number | null;
  kycStatus: string;
  disabledReasons: string[];
  policy?: { dorocoinNotCash?: string; rewardPointsNotCash?: string };
  accountType: string;
  eligibleSources: Array<{ id: string; sourceType: string; challengeId?: string | null; settlementId?: string | null; grossAmountCents: number; feeAmountCents: number; netAmountCents: number; currency: string; status: string }>;
};

type Method = "bank_transfer" | "paypal";

export default function WithdrawPage() {
  const [data, setData] = useState<WithdrawalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await apiRequest<WithdrawalData>("/api/withdrawals");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    const payload = result.data;
    setData(payload);
    setSourceId((current) => current || payload.eligibleSources?.[0]?.id || "");
  }

  useEffect(() => { void load(); }, []);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const amountCents = Math.round(Number(amount || 0) * 100);
    setSubmitting(true);
    const result = await apiRequest<{ request: WithdrawalRecord }>("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        amountCents,
        sourceId,
        method,
        methodDetails: method === "paypal"
          ? { accountHolderName, email: paypalEmail }
          : { accountHolderName, bankName, accountNumber, country: "US" }
      })
    });
    setSubmitting(false);
    setNotice(result.message);
    if (result.ok) {
      setAmount("");
      setAccountHolderName("");
      setBankName("");
      setAccountNumber("");
      setPaypalEmail("");
      await load();
    }
  }

  const min = (data?.minimumWithdrawalCents ?? 1000) / 100;
  const available = (data?.wallet.availableBalanceCents ?? 0) / 100;
  const selectedSource = data?.eligibleSources?.find((source) => source.id === sourceId);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <LinkButton href="/wallet" variant="ghost"><ArrowLeft size={17} /> Back to Wallet</LinkButton>
        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle title="Withdraw" subtitle="Submit eligible cash earnings for review." icon={<Landmark />} />
          <span className="rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-4 py-2 text-xs font-black uppercase text-[var(--gold)]">Pending review</span>
        </div>

        {notice ? <Card className="mt-6 border-yellow-500/20 p-4 text-sm text-slate-200">{notice}</Card> : null}
        {loading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-28 animate-pulse" />)}</div> : null}
        {data ? <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Balance label="Available" value={data.wallet.availableBalanceCents} />
            <Balance label="Pending" value={data.wallet.pendingBalanceCents} />
            <Balance label="Under review" value={data.wallet.underReviewBalanceCents} />
            <Balance label="Withdrawn" value={data.wallet.withdrawnBalanceCents} />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
            <Card className="p-6 sm:p-8">
              <h2 className="text-2xl font-black">Withdrawal request</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Bank Transfer and PayPal requests are reviewed before payout. No automatic payout is executed.</p>
              <form className="mt-6 space-y-5" onSubmit={submitRequest}>
                <Field label="Eligible earning">
                  <select className={inputClass} value={sourceId} onChange={(event) => { const next = event.target.value; setSourceId(next); const source = data.eligibleSources.find((item) => item.id === next); setAmount(source ? (source.netAmountCents / 100).toFixed(2) : ""); }} required>
                    <option value="">Choose an earning source</option>
                    {(data.eligibleSources ?? []).map((source) => <option key={source.id} value={source.id}>{withdrawalSourceLabel(source.sourceType)} - ${(source.netAmountCents / 100).toFixed(2)}</option>)}
                  </select>
                </Field>
                {selectedSource ? <div className="grid gap-3 rounded-[8px] border border-white/10 bg-black/25 p-4 sm:grid-cols-3"><BalanceDetail label="Gross" value={selectedSource.grossAmountCents} /><BalanceDetail label="Fees already deducted" value={selectedSource.feeAmountCents} /><BalanceDetail label="Net available" value={selectedSource.netAmountCents} /></div> : null}
                <Field label="Payout method"><select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as Method)}><option value="bank_transfer">Bank Transfer</option><option value="paypal">PayPal</option></select></Field>
                <Field label="Amount"><input className={inputClass} type="number" min={min} max={available || undefined} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Available $${available.toFixed(2)}`} /></Field>
                <Field label="Account holder name"><input className={inputClass} value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} /></Field>
                {method === "bank_transfer" ? <div className="grid gap-5 sm:grid-cols-2"><Field label="Bank name"><input className={inputClass} value={bankName} onChange={(event) => setBankName(event.target.value)} /></Field><Field label="Account number"><input className={inputClass} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" /></Field></div> : <Field label="PayPal email"><input className={inputClass} type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} /></Field>}
                <Button className="w-full" disabled={submitting || available <= 0 || !sourceId}>{submitting ? "Submitting..." : "Submit Withdrawal Request"}</Button>
              </form>
              <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-50/90">DoroCoins cannot be withdrawn or converted to cash.</p>
            </Card>
            <Card className="p-6 sm:p-8">
              <ShieldCheck className="text-[var(--gold)]" size={34} />
              <h2 className="mt-5 text-2xl font-black">Review checks</h2>
              <div className="mt-6 space-y-3 text-sm text-slate-400">
                <p>KYC is required before withdrawal approval.</p>
                <p>Requests are created as pending review.</p>
                <p>No instant payout is available.</p>
                <p><a className="font-bold text-[var(--gold)]" href="/kyc/status">Review KYC status</a></p>
              </div>
            </Card>
          </div>
          <section className="mt-10">
            <h2 className="text-2xl font-black">Withdrawal history</h2>
            <Card className="mt-5 overflow-hidden">
              {data.requests.length ? data.requests.map((record) => <div key={record.id} className="grid gap-2 border-b border-white/10 p-5 md:grid-cols-[130px_1fr_150px_150px]"><span className="text-sm text-slate-400">{record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "Pending"}</span><span className="font-bold">{record.payoutMethodLabel ?? "Payout method under review"}</span><span className="font-black text-[var(--gold)]">${(record.amountCents / 100).toFixed(2)} {record.currency}</span><span className="capitalize text-slate-300">{record.status.replaceAll("_", " ")}</span></div>) : <EmptyState icon={<Landmark />} title="No withdrawal requests" body="Submitted requests will appear here." />}
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

function BalanceDetail({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">${(Number(value || 0) / 100).toFixed(2)}</p></div>;
}

function withdrawalSourceLabel(sourceType: string) {
  if (sourceType === "challenge_winner_prize") return "Challenge winner prize";
  if (sourceType === "sponsor_prize") return "Sponsor-funded prize";
  if (sourceType === "prediction_reward") return "Prediction reward";
  if (sourceType === "creator_challenge_earning") return "Creator challenge earning";
  return "Cash earning";
}

