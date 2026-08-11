"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import type { PaymentPurpose, VerifiedPaymentState } from "@/lib/payment-purposes";

type PaymentStatus = {
  purpose: PaymentPurpose;
  state: VerifiedPaymentState;
  amountCents: number | null;
  currency: string;
  providerReference: string | null;
  resourceId: string | null;
  confirmedAt: string | null;
  webhookConfirmed: boolean;
  units?: number | null;
  planId?: string | null;
  billingCycle?: string | null;
  currentPeriodEnd?: string | null;
};

type JourneyCopy = {
  eyebrow: string;
  pendingTitle: string;
  confirmedTitle: string;
  pendingBody: string;
  confirmedBody: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function PaymentStatusJourney({
  purpose,
  reference,
  resourceId,
  copy
}: {
  purpose: PaymentPurpose;
  reference?: string | null;
  resourceId?: string | null;
  copy: JourneyCopy;
}) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const [timedOut, setTimedOut] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ purpose });
    if (reference) params.set("reference", reference);
    if (resourceId) params.set("resourceId", resourceId);
    return `/api/payments/status?${params.toString()}`;
  }, [purpose, reference, resourceId]);

  async function refresh() {
    const result = await apiRequest<PaymentStatus>(`${query}&verify=1`);
    setAttempts((value) => value + 1);
    if (result.ok && result.data) {
      setStatus(result.data);
      setMessage("");
    } else {
      setMessage(result.message || "Payment status could not be loaded.");
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    let firstCheck = true;
    const poll = async () => {
      const result = await apiRequest<PaymentStatus>(firstCheck ? `${query}&verify=1` : query);
      firstCheck = false;
      if (cancelled) return;
      setAttempts((value) => value + 1);
      if (result.ok && result.data) {
        setStatus(result.data);
        setMessage("");
        if (result.data.state === "processing" && Date.now() - startedAt < 90_000) timer = window.setTimeout(poll, 4000);
        else if (result.data.state === "processing") setTimedOut(true);
      } else {
        setMessage(result.message || "Payment status could not be loaded.");
      }
      setLoading(false);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [query]);

  const confirmed = status?.state === "confirmed" && status.webhookConfirmed;
  const terminalFailure = status && ["failed", "refunded", "reversed"].includes(status.state);
  const title = loading ? "Checking payment status" : confirmed ? copy.confirmedTitle : terminalFailure ? "Payment needs attention" : timedOut ? "Activation is still processing" : copy.pendingTitle;
  const body = loading
    ? "Loading the verified provider record."
    : confirmed
      ? copy.confirmedBody
      : terminalFailure
        ? "The provider record is not active. Review the status below before trying again."
        : timedOut
          ? "Your access will update automatically after the payment provider confirms the subscription. You can finish later and return from Billing."
          : copy.pendingBody;

  return <AppShell>
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{copy.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">{body}</p>

      <Card className="mt-8 border-yellow-300 bg-white p-5 text-slate-950 shadow-xl sm:p-7" aria-live="polite">
        <div className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Membership activation progress">
          {["Payment received", "Activating Host plan", "Host plan active"].map((label, index) => <div key={label} className={`rounded-[8px] border p-3 text-sm font-black ${confirmed || index === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : index === 1 ? "border-yellow-300 bg-yellow-50 text-yellow-900" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{label}</div>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatusItem label="Status" value={loading ? "Loading" : labelState(status?.state)} />
          <StatusItem label="Verification" value={confirmed ? "Provider confirmed" : "Awaiting provider confirmation"} />
          {status?.amountCents !== null && status?.amountCents !== undefined ? <StatusItem label="Amount" value={formatMoney(status.amountCents, status.currency)} /> : null}
          {status?.units ? <StatusItem label="Credits" value={status.units.toLocaleString()} /> : null}
          {status?.planId ? <StatusItem label="Plan" value={status.planId} /> : null}
          {status?.billingCycle ? <StatusItem label="Billing cycle" value={status.billingCycle} /> : null}
          <StatusItem label="Confirmed" value={status?.confirmedAt ? new Date(status.confirmedAt).toLocaleString() : "Pending"} />
          {status?.currentPeriodEnd ? <StatusItem label="Next renewal" value={new Date(status.currentPeriodEnd).toLocaleDateString()} /> : null}
        </div>
        <details className="mt-5 rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-black">Technical details</summary><p className="mt-2 break-all text-slate-600">Support reference: {status?.providerReference || reference || "Pending"}</p></details>
        {message ? <p className="mt-5 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
        {!confirmed ? <Button className="mt-6" variant="secondary" onClick={() => void refresh()} disabled={loading}>Refresh Status</Button> : null}
        {timedOut && !confirmed ? <p className="mt-4 text-sm text-slate-600">Confirmation is taking longer than usual. No entitlement has been granted from this page.</p> : null}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        {confirmed ? <LinkButton href={copy.primaryHref}>{copy.primaryLabel}</LinkButton> : null}
        {copy.secondaryHref && copy.secondaryLabel ? <LinkButton href={copy.secondaryHref} variant="secondary">{copy.secondaryLabel}</LinkButton> : null}
      </div>
    </div>
  </AppShell>;
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 break-words font-black text-slate-950">{value}</p></div>;
}

function labelState(state?: VerifiedPaymentState) {
  if (!state) return "Processing";
  return state.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}
