"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { Button, Card } from "@/components/ui";

export function TournamentEntryWithdrawal({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function withdraw() {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/join`, { method: "DELETE" });
      setMessage(result.message);
      if (result.ok) { setConfirm(false); router.refresh(); }
    } catch { setMessage("Withdrawal was not confirmed. Refresh your entry before retrying."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-6 space-y-3 p-5"><h2 className="font-bold">Withdraw before the bracket fills</h2><p className="text-sm text-slate-600">No reason is required. A paid entry receives a full entry-fee refund only after provider confirmation. Rejoining requires current eligibility, an available place and a fresh payment when applicable.</p><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />I want to withdraw this entry.</label><Button variant="secondary" disabled={!confirm || busy} onClick={() => void withdraw()}>{busy ? "Withdrawing…" : "Withdraw entry"}</Button>{message ? <p role="status">{message}</p> : null}</Card>;
}
