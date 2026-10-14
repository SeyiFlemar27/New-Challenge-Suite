"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Field, inputClass } from "@/components/ui";
export function NormalParticipationWithdrawal({ challengeId, onComplete }: { challengeId: string; onComplete: () => void }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function withdraw() {
    if (!confirmed || !reason.trim() || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/challenges/${encodeURIComponent(challengeId)}/withdraw`, { method: "POST", body: JSON.stringify({ reason, confirmed }) });
      setNotice(result.message);
      if (result.ok) onComplete();
    } catch { setNotice("Withdrawal could not be recorded. Check your status before retrying."); }
    finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl border border-[var(--gold)]/20 p-4"><summary className="cursor-pointer font-bold">Withdraw before voting</summary><div className="mt-4 space-y-3"><p className="text-sm">Withdrawal removes you from winner eligibility. An eligible paid entry refund remains pending until the provider confirms it.</p><Field label="Withdrawal reason"><input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm that I want to withdraw from this challenge.</label><Button variant="secondary" disabled={busy || !confirmed || !reason.trim()} onClick={() => void withdraw()}>Confirm withdrawal</Button>{notice ? <p role="status">{notice}</p> : null}</div></details>;
}
