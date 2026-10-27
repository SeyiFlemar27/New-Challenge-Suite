"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { IndividualCorrectionEvidence } from "@/components/admin/individual-correction-evidence";

type Row = Record<string, unknown> & { id: string };
type AdminBundle = { tournament: Row; submissions: Row[]; matches: Row[]; participants: Row[]; disputes: Row[] };
export function AdminTournamentDecisions({ id }: { id: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<AdminBundle | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [eligibility, setEligibility] = useState("temporary_hold");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [matchId, setMatchId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [caseKey, setCaseKey] = useState("");
  useEffect(() => {
    let cancelled = false;
    void apiRequest<AdminBundle>(`/api/admin/tournaments/${encodeURIComponent(id)}`).then(result => {
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
      const result = await apiRequest(`/api/admin/tournaments/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ ...extra, ...(submissionId ? { expectedRevision: Number(bundle?.submissions.find(row => row.id === submissionId)?.revision ?? 1) } : {}), action, submissionId, reason: reason.trim(), confirmed }) });
      setMessage(result.message);
      if (result.ok) {
        setConfirmed(false);
        const refresh = await apiRequest<AdminBundle>(`/api/admin/tournaments/${encodeURIComponent(id)}`);
        if (refresh.ok && refresh.data) setBundle(refresh.data);
        router.refresh();
      }
    } finally { setBusy(false); }
  }
  const disabled = busy || !confirmed || reason.trim().length < 5;
  const teams: Row[] = Array.isArray(bundle?.tournament.teamEntitlementEvidence) ? bundle.tournament.teamEntitlementEvidence : [];
  const selectedTeam = teams.find(team => team.id === teamId);
  const roster: string[] = Array.isArray(selectedTeam?.memberUserIds) ? selectedTeam.memberUserIds : [];
  const individual = Boolean(bundle && isIndividualTournamentPolicy(bundle.tournament));
  const selectedMatch = bundle?.matches?.find(row => row.id === matchId);
  const reviewDisabled = disabled || !selectedMatch || evidenceReference.trim().length < 5 || !/^[\w-]{8,100}$/.test(caseKey);
  return <Card className="my-6 space-y-4 p-5" aria-labelledby="tournament-admin-decisions">
    <h2 id="tournament-admin-decisions" className="text-xl font-black">Authorized Tournament decisions</h2>
    <p className="text-sm text-slate-500">Each decision is validated and audited by the server. Settlement approval prepares internal allocations; it never executes an external payout.</p>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {!bundle ? <p aria-busy={!message}>Loading authorized evidence…</p> : <>
      <Field label="Decision reason (required)"><textarea className={textareaClass} value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={500} required /></Field>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have reviewed the relevant evidence and confirm this decision.</label>
      {bundle.tournament.status === "pending_review" ? <p className="text-sm">This historical publication requires revalidation. Routine editorial approval has been retired.</p> : null}
      {!individual && ["under_review", "final"].includes(String(bundle.tournament.status)) ? <Button disabled={disabled} onClick={() => void decide("approve_payout_foundation")}>Approve verified placements and prepare settlement</Button> : null}
      {individual ? <section className="space-y-4 rounded-xl border p-4" aria-label="Individual Tournament evidence review">
        <h3 className="font-bold">Individual Tournament evidence review</h3>
        <p className="text-sm text-slate-600">Only affected dependencies and prize credits are held. A structural conflict with two eligible first-loss competitors cannot be resolved by choosing one or adding a match. Result corrections must match the complete persisted vote evidence; withdrawn funds require manual recovery.</p>
        {(bundle.disputes ?? []).filter(row => row.status === "open" && row.escalatedAt).map(row => <p key={row.id} role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Overdue review: {String(row.matchId)}. Existing holds remain in force.</p>)}
        {(bundle.disputes ?? []).filter(row => row.status === "open" && row.competitivePolicyRequired === true).map(row => <details key={row.id} className="min-w-0 break-words rounded-xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer font-bold">Unresolved upstream correction — {String(row.matchId)}</summary><p className="my-3 text-sm">Affected progression, dependent results, placements and related releases remain held. Reviewing this evidence does not resolve the case or authorize replay, voiding or validation of played matches. Original records and legitimate losses remain preserved.</p><IndividualCorrectionEvidence proposal={row.correctionProposal} /></details>)}
        <Field label="Affected match"><select aria-label="Affected match" className={inputClass} value={matchId} onChange={event => setMatchId(event.target.value)}><option value="">Select a match</option>{(bundle.matches ?? []).map(row => <option key={row.id} value={row.id}>{String(row.bracket ?? "Match")} {Number(row.roundNumber ?? 0)}.{Number(row.matchNumber ?? 0)} — {String(row.status)}</option>)}</select></Field>
        <Field label="Evidence reference"><input className={inputClass} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} minLength={5} maxLength={500} /></Field>
        <Field label="Review reference (8–100 letters, numbers, hyphens or underscores)"><input className={inputClass} value={caseKey} onChange={event => setCaseKey(event.target.value)} maxLength={100} /></Field>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={reviewDisabled} onClick={() => void decide("resolve_dispute", undefined, { decision: "hold", matchId, evidenceReference, idempotencyKey: caseKey })}>Open affected-only review</Button>
          <Button variant="secondary" disabled={reviewDisabled || bundle.disputes.some(row => row.matchId === matchId && row.status === "open" && row.competitivePolicyRequired === true)} onClick={() => void decide("resolve_dispute", undefined, { decision: "confirm_existing_result", matchId, evidenceReference, idempotencyKey: caseKey })}>Confirm unchanged result and restore clocks</Button>
          <Button variant="secondary" disabled={reviewDisabled || selectedMatch?.status !== "double_forfeit_hold"} onClick={() => void decide("resolve_dispute", undefined, { decision: "recheck_structural_conflict", matchId, evidenceReference, idempotencyKey: caseKey })}>Recheck structural eligibility</Button>
          <Button disabled={reviewDisabled} onClick={() => void decide("resolve_dispute", undefined, { decision: "correct_verified_result", matchId, evidenceReference, caseKey, idempotencyKey: `correction-${caseKey}-${Number(bundle.tournament.prizeCorrectionVersion ?? 0)}`, expectedVersion: Number(bundle.tournament.prizeCorrectionVersion ?? 0) })}>Verify correction and protect affected prizes</Button>
        </div>
        <Field label="Competitor for disqualification"><select className={inputClass} value={participantId} onChange={event => setParticipantId(event.target.value)}><option value="">Select a competitor</option>{(bundle.participants ?? []).map(row => <option key={row.id} value={row.id}>{String(row.displayName ?? row.id)} — {String(row.status)}</option>)}</select></Field>
        <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={disabled || !participantId || evidenceReference.trim().length < 5} onClick={() => void decide("disqualify", undefined, { participantId, evidenceReference })}>Disqualify selected competitor</Button><Button variant="secondary" disabled={disabled || bundle.tournament.status === "cancelled"} onClick={() => void decide("cancel")}>Cancel Tournament and record refund liabilities</Button></div>
      </section> : null}
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
