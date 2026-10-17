"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
type Agreement = { id: string; status: string; fundingStatus: string; termsVersion: number; terms: { amountCents: number; currency: string; deliverables?: string[] } };
export function TournamentSponsorshipManagement({ tournamentId }: { tournamentId: string }) {
  const [canApprove, setCanApprove] = useState(false);
  const [rows, setRows] = useState<Agreement[]>([]), [message, setMessage] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await apiRequest<{ interests: Agreement[]; canApprove: boolean }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/sponsorship-interests`);
    if (result.ok && result.data) { setRows(result.data.interests); setCanApprove(result.data.canApprove); } else setMessage(result.message);
  }, [tournamentId]);
  useEffect(() => {
    let active = true;
    void apiRequest<{ interests: Agreement[]; canApprove: boolean }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/sponsorship-interests`).then(result => {
      if (!active) return;
      if (result.ok && result.data) { setRows(result.data.interests); setCanApprove(result.data.canApprove); } else setMessage(result.message);
    }).catch(() => { if (active) setMessage("Unable to load sponsorship agreements."); });
    return () => { active = false; };
  }, [tournamentId]);
  async function decide(id: string, action: "accept" | "reject") {
    setBusy(true); setMessage("");
    try {
      const result = await apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/sponsorship-interests`, { method: "PATCH", body: JSON.stringify({ agreementId: id, action, reason, confirmed }) });
      setMessage(result.message);
      if (result.ok) { setReason(""); setConfirmed(false); await load(); }
    } catch { setMessage("The decision was not confirmed. Refresh its status before retrying."); } finally { setBusy(false); }
  }
  return <Card className="space-y-4 p-5">
    <h2 className="text-xl font-bold">Sponsorship agreements</h2>
    <p className="text-sm">Accepting terms does not confirm payment. Only verified eligible funds received before first match voting can enter the winner pool.</p>
    {message ? <p role="status">{message}</p> : null}
    {rows.length ? rows.map(row => <section key={row.id} className="space-y-2 border-t border-[var(--line)] pt-3">
      <p className="font-semibold">Version {row.termsVersion} · {new Intl.NumberFormat("en-US", { style: "currency", currency: row.terms.currency }).format(row.terms.amountCents / 100)}</p>
      <p>Agreement: {row.status.replaceAll("_", " ")} · Funding: {row.fundingStatus.replaceAll("_", " ")}</p>
      {row.terms.deliverables?.map((item, index) => <p key={index}>{item}</p>)}
      {canApprove && row.status === "interest_submitted" ? <div className="flex gap-3">
        <Button disabled={busy || !confirmed || reason.trim().length < 5} onClick={() => void decide(row.id, "accept")}>Accept these terms</Button>
        <Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 5} onClick={() => void decide(row.id, "reject")}>Reject</Button>
      </div> : null}
    </section>) : <p>No sponsorship agreements yet.</p>}
    {canApprove ? <>
      <label className="block text-sm">Decision reason<input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the displayed agreement version and confirm this decision.</label>
    </> : <p className="text-sm">Only the Tournament owner or authorized Admin can accept financial terms.</p>}
  </Card>;
}
