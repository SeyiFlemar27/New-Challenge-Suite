"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";

type Row = Record<string, unknown> & { id: string };
export function AdminTournamentDecisions({ id }: { id: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<{ tournament: Row; submissions: Row[] } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [eligibility, setEligibility] = useState("temporary_hold");
  const [evidenceReference, setEvidenceReference] = useState("");
  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ tournament: Row; submissions: Row[] }>(`/api/admin/tournaments/${encodeURIComponent(id)}`).then(result => {
      if (cancelled) return;
      if (result.ok && result.data) setBundle(result.data);
      else setMessage(result.message || "Authorized review is unavailable.");
    });
    return () => { cancelled = true; };
  }, [id]);
  async function decide(action: string, submissionId?: string, extra: Record<string, unknown> = {}) {
    if (!confirmed || reason.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/admin/tournaments/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ ...extra, action, submissionId, reason: reason.trim(), confirmed }) });
      setMessage(result.message);
      if (result.ok) {
        setConfirmed(false);
        const refresh = await apiRequest<{ tournament: Row; submissions: Row[] }>(`/api/admin/tournaments/${encodeURIComponent(id)}`);
        if (refresh.ok && refresh.data) setBundle(refresh.data);
        router.refresh();
      }
    } finally { setBusy(false); }
  }
  const disabled = busy || !confirmed || reason.trim().length < 5;
  const teams: Row[] = Array.isArray(bundle?.tournament.teamEntitlementEvidence) ? bundle.tournament.teamEntitlementEvidence : [];
  const selectedTeam = teams.find(team => team.id === teamId);
  const roster: string[] = Array.isArray(selectedTeam?.memberUserIds) ? selectedTeam.memberUserIds : [];
  return <Card className="my-6 space-y-4 p-5" aria-labelledby="tournament-admin-decisions">
    <h2 id="tournament-admin-decisions" className="text-xl font-black">Authorized Tournament decisions</h2>
    <p className="text-sm text-slate-500">Each decision is validated and audited by the server. Settlement approval prepares internal allocations; it never executes an external payout.</p>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {!bundle ? <p aria-busy={!message}>Loading authorized evidence…</p> : <>
      <Field label="Decision reason (required)"><textarea className={textareaClass} value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={500} required /></Field>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have reviewed the relevant evidence and confirm this decision.</label>
      {bundle.tournament.status === "pending_review" ? <p className="text-sm">This historical publication requires revalidation. Routine editorial approval has been retired.</p> : null}
      {["under_review", "final"].includes(String(bundle.tournament.status)) ? <Button disabled={disabled} onClick={() => void decide("approve_payout_foundation")}>Approve verified placements and prepare settlement</Button> : null}
      {bundle.tournament.participationMode === "team" ? <section className="space-y-3 rounded-xl border p-4" aria-label="Team prize entitlement reconciliation">
        <h3 className="font-bold">Team prize entitlement reconciliation</h3>
        <p className="text-sm">Use an authoritative eligibility determination. Temporary restrictions reserve the member share. Completed payouts and uncertain financial cases remain held for recovery review; this action never sends money.</p>
        <Field label="Locked team"><select className={inputClass} value={teamId} onChange={event => { setTeamId(event.target.value); setMemberId(""); }}><option value="">Select a team</option>{teams.filter(team => team.rosterLockedAt).map(team => <option key={team.id} value={team.id}>{String(team.name ?? team.id)} — version {Number(team.entitlementVersion ?? 0)}</option>)}</select></Field>
        <Field label="Locked-roster member"><select className={inputClass} value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">Select a member</option>{roster.map(uid => <option key={uid} value={uid}>{uid}</option>)}</select></Field>
        <Field label="Authoritative eligibility decision"><select className={inputClass} value={eligibility} onChange={event => setEligibility(event.target.value)}><option value="temporary_hold">Temporary hold — do not redistribute</option><option value="permanently_ineligible">Permanently ineligible</option><option value="eligible">Eligible — corrected determination</option></select></Field>
        <Field label="Eligibility evidence reference"><input className={inputClass} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} minLength={5} maxLength={500} /></Field>
        <Button disabled={disabled || !roster.includes(memberId) || evidenceReference.trim().length < 5} onClick={() => void decide("reconcile_team_entitlements", undefined, { teamId, userId: memberId, decision: eligibility, evidenceReference, expectedVersion: Number(selectedTeam?.entitlementVersion ?? 0), idempotencyKey: `team-eligibility-${teamId}-${Number(selectedTeam?.entitlementVersion ?? 0)}` })}>Record decision and reconcile unpaid entitlement</Button>
      </section> : null}
      <ul className="space-y-3">{bundle.submissions.filter(submission => ["submitted", "pending_moderation", "under_review"].includes(String(submission.status))).map(submission => <li key={submission.id} className="rounded-xl border border-[var(--line)] p-4"><p className="break-all text-sm">Submission {submission.id}</p>{typeof submission.mediaUrl === "string" ? <a href={submission.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline">Inspect submitted media (new tab)</a> : <p>Media evidence is unavailable.</p>}<div className="mt-3 flex flex-wrap gap-3"><Button disabled={disabled || !submission.mediaUrl} onClick={() => void decide("submission_approved", submission.id)}>Approve submission</Button><Button variant="secondary" disabled={disabled} onClick={() => void decide("submission_rejected", submission.id)}>Reject submission</Button></div></li>)}</ul>
    </>}
  </Card>;
}
