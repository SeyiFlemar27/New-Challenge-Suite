"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

export default function RewardAdjustmentsPage() {
  const [userId, setUserId] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState("Reward Wheel QA");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const expectedConfirmation = direction === "credit" ? "CONFIRM REWARD CREDIT" : "CONFIRM REWARD DEBIT";

  async function submit() {
    setBusy(true);
    const response = await apiRequest("/api/admin/rewards/adjustments", { method: "POST", body: JSON.stringify({ userId: userId.trim(), direction, amount, reason: reason.trim(), confirmation, idempotencyKey: crypto.randomUUID() }) });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) setConfirmation("");
  }

  return <AdminShell><PageTitle title="User Adjustments" subtitle="Create permissioned Reward Point credits or debits through the immutable ledger." icon={<SlidersHorizontal />} />{message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}<Card className="mt-8 max-w-2xl p-6"><div className="space-y-5"><Field label="User ID"><input className={inputClass} value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="off" /></Field><Field label="Direction"><select className={inputClass} value={direction} onChange={(event) => { setDirection(event.target.value === "debit" ? "debit" : "credit"); setConfirmation(""); }}><option value="credit">Credit Reward Points</option><option value="debit">Debit Reward Points</option></select></Field><Field label="Amount"><input className={inputClass} type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Reason"><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Field label={`Type ${expectedConfirmation} to confirm`}><input className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field><p className="text-sm text-[var(--muted)]">This action uses the canonical Reward ledger. It does not edit a cached balance directly and requires recent authorized Admin authentication.</p><Button onClick={submit} disabled={busy || !userId.trim() || amount <= 0 || reason.trim().length < 8 || confirmation !== expectedConfirmation}>Record Adjustment</Button></div></Card></AdminShell>;
}
