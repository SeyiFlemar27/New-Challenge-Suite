"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, textareaClass } from "@/components/ui";
export function TournamentPlacementReview({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function review() {
    if (busy || !confirmed || reason.trim().length < 5) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/tournaments/${encodeURIComponent(id)}/manage/actions`, { method: "POST", body: JSON.stringify({ action: "review_final_placements", confirmed, reason: reason.trim() }) });
      setMessage(result.message);
      if (result.ok) { setConfirmed(false); router.refresh(); }
    } catch { setMessage("The review outcome could not be confirmed. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-6 space-y-4 p-5"><h2 className="text-xl font-black">Creator placement review</h2><p className="text-sm">Review the verified match-derived placements above. This confirms review; it cannot replace winners or execute payouts. Admin final approval is still required.</p><Field label="Review reason (required)"><textarea value={reason} onChange={event => setReason(event.target.value)} className={textareaClass} required minLength={5} maxLength={500} /></Field><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have reviewed the competition-derived placements and confirm this review.</label><Button disabled={busy || !confirmed || reason.trim().length < 5} onClick={() => void review()}>{busy ? "Recording review…" : "Confirm review for Admin finalization"}</Button>{message ? <p role="status">{message}</p> : null}</Card>;
}
