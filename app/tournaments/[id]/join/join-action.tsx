"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type RegistrationResult = { outcome?: string; participant?: { status?: string }; checkoutUrl?: string; reservationExpiresAt?: string };

type PaymentStatusResult = { status?: string; refundStatus?: string; refundReason?: string; reservationExpiresAt?: string };

export function TournamentJoinAction({ id, status, participationMode, entryType, sessionId = "", paymentReturn = "" }: {
  id: string;
  status: string;
  participationMode: string;
  entryType: string;
  sessionId?: string;
  paymentReturn?: string;
}) {
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [registered, setRegistered] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusResult | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const paidEntry = entryType !== "free";
  const unavailable = status !== "registration_open" || participationMode !== "individual";

  useEffect(() => {
    if (!sessionId || paymentReturn !== "processing") return;
    let active = true;
    let attempts = 0;
    const check = async () => {
      if (!active || attempts >= 10) return;
      attempts += 1;
      setCheckingPayment(true);
      const result = await apiRequest<PaymentStatusResult>(`/api/tournaments/${encodeURIComponent(id)}/entry-payment?session_id=${encodeURIComponent(sessionId)}`);
      if (!active) return;
      if (result.ok) {
        setPaymentStatus(result.data ?? null);
        if (["confirmed", "refunded", "refund_pending", "refund_required", "refund_review_required", "expired", "payment_failed"].includes(String(result.data?.status))) {
          setCheckingPayment(false);
          return;
        }
      }
      if (attempts < 10) window.setTimeout(() => void check(), 2_000);
      else setCheckingPayment(false);
    };
    void check();
    return () => { active = false; };
  }, [id, sessionId, paymentReturn]);

  async function submit() {
    if (!rulesAccepted || pending || unavailable) return;
    setPending(true);
    setMessage("");
    const result = await apiRequest<RegistrationResult>(`/api/tournaments/${encodeURIComponent(id)}/join`, {
      method: "POST",
      body: JSON.stringify({ rulesAccepted: true })
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.message || "Tournament registration could not be completed.");
      return;
    }
    if (result.data?.checkoutUrl) {
      setMessage("Your slot is reserved for ten minutes. Redirecting to secure card checkout…");
      window.location.assign(result.data.checkoutUrl);
      return;
    }
    setRegistered(true);
    setMessage(result.message || `Tournament registration ${result.data?.outcome ?? "confirmed"}.`);
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-xl font-black">Registration</h2>
      {participationMode === "team" ? (
        <p className="mt-3 text-sm text-slate-400">Team tournaments require joining or creating an eligible team from the tournament lobby.</p>
      ) : paymentReturn === "processing" ? (
        <div role="status" aria-live="polite" className="mt-3 rounded-[8px] border border-white/10 p-4 text-sm">
          <b>{paymentStatus?.status === "confirmed" ? "Registration confirmed" : ["refund_pending", "refund_required", "refund_review_required"].includes(String(paymentStatus?.status)) ? "Payment review in progress" : paymentStatus?.status === "refunded" ? "Payment refunded" : paymentStatus?.status === "payment_failed" || paymentStatus?.status === "expired" ? "Registration was not completed" : checkingPayment ? "Verifying payment" : "Payment confirmation is pending"}</b>
          <p className="mt-1 text-slate-400">{paymentStatus?.status === "confirmed" ? "Stripe confirmed your entry. Your registration is complete." : ["refund_pending", "refund_required", "refund_review_required"].includes(String(paymentStatus?.status)) ? "The payment could not be matched to an eligible slot. It is being reconciled; do not submit another payment until the outcome is clear." : paymentStatus?.status === "refunded" ? "The payment was refunded because registration could not be completed." : paymentStatus?.status === "payment_failed" || paymentStatus?.status === "expired" ? "No Tournament registration was created. You may return to the Tournament page and try again if registration remains open." : "Your registration is not complete until provider confirmation is received."}</p>
        </div>
      ) : paymentReturn === "canceled" ? (
        <p role="status" className="mt-3 text-sm text-slate-400">Checkout was canceled. Any reservation expires automatically after ten minutes; no registration was created.</p>
      ) : status !== "registration_open" ? (
        <p className="mt-3 text-sm text-slate-400">Registration is not currently open.</p>
      ) : registered ? (
        <p role="status" className="mt-3 rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{message}</p>
      ) : (
        <>
          <label className="mt-4 flex items-start gap-3 text-sm font-bold leading-6">
            <input className="mt-1" type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} />
            <span>I accept the Tournament rules and registration terms.</span>
          </label>
          {message ? <p role="alert" className="mt-3 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">{message}</p> : null}
          <Button className="mt-4" disabled={!rulesAccepted || pending} onClick={() => void submit()}>
            {pending ? (paidEntry ? "Preparing secure checkout…" : "Submitting...") : paidEntry ? "Reserve Slot & Pay Entry Fee" : "Submit Tournament Registration"}
          </Button>
        </>
      )}
    </Card>
  );
}
