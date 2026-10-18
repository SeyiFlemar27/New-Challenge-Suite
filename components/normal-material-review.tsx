"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
export function NormalMaterialProposal({ challengeId, updatedAt }: { challengeId: string; updatedAt: string }) {
  const [field, setField] = useState("submissionDeadline"), [value, setValue] = useState(""), [reason, setReason] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const proposed = field.endsWith("Deadline") ? new Date(value).toISOString() : value.split("\n").map(item => item.trim()).filter(Boolean);
      const result = await apiRequest(`/api/challenges/${encodeURIComponent(challengeId)}/material-changes`, { method: "POST", body: JSON.stringify({ changes: { [field]: proposed }, expectedUpdatedAt: updatedAt, reason }) });
      setNotice(result.message);
    } catch { setNotice("Enter a valid value before requesting review."); } finally { setBusy(false); }
  }
  return <Card className="mt-5 space-y-4 p-5"><h2 className="font-bold">Request a material change</h2><p className="text-sm">Published values remain unchanged until Admin approval. Deadlines cannot be shortened or reopened after expiry. Financial commitments remain locked.</p><Field label="Proposed field"><select className={inputClass} value={field} onChange={event => { setField(event.target.value); setValue(""); }}><option value="registrationDeadline">Registration deadline</option><option value="submissionDeadline">Submission deadline</option><option value="votingDeadline">Voting deadline</option><option value="challengeRules">Challenge rules</option><option value="submissionInstructionsList">Submission instructions</option></select></Field><Field label={field.endsWith("Deadline") ? "Proposed deadline (your local time)" : "Proposed items (one per line)"}>{field.endsWith("Deadline") ? <input className={inputClass} type="datetime-local" value={value} onChange={event => setValue(event.target.value)} /> : <textarea className={textareaClass} value={value} onChange={event => setValue(event.target.value)} />}</Field><Field label="Required reason"><textarea className={textareaClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field><Button disabled={busy || reason.trim().length < 8} onClick={() => void submit()}>Request Admin review</Button>{notice ? <p role="status">{notice}</p> : null}</Card>;
}
type Proposal = { id: string; challengeId: string; before: Record<string, unknown>; proposed: Record<string, unknown>; reason: string };
export function NormalMaterialAdminReview({kind="normal"}:{kind?:"normal"|"live_event"}={}) {
  const [rows, setRows] = useState<Proposal[]>([]), [notice, setNotice] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const endpoint=kind==="live_event"?"/api/admin/live-event-changes":"/api/admin/normal-material-changes";
  async function load() { const result = await apiRequest<{ requests: Proposal[] }>(endpoint); if (result.ok && result.data) setRows(result.data.requests); else setNotice(result.message); }
  useEffect(() => {
    let active = true;
    void apiRequest<{ requests: Proposal[] }>(endpoint).then(result => {
      if (!active) return;
      if (result.ok && result.data) setRows(result.data.requests); else setNotice(result.message);
    });
    return () => { active = false; };
  }, [endpoint]);
  async function decide(id: string, decision: "approve" | "reject") { setBusy(true); try { const result = await apiRequest(endpoint, { method: "POST", body: JSON.stringify({ id, decision, reason, confirmed }) }); setNotice(result.message); if (result.ok) { setConfirmed(false); setReason(""); await load(); } } finally { setBusy(false); } }
  return <Card className="mt-6 space-y-4 p-5"><h2 className="font-bold">{kind==="live_event"?"Published Live Event changes":"Published Normal Challenge changes"}</h2>{rows.length === 0 ? <p>No pending requests loaded.</p> : rows.map(row => <section key={row.id} className="space-y-2 border-b p-3"><h3 className="font-semibold">{row.challengeId}</h3><p>{row.reason}</p><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ existing: row.before, proposed: row.proposed }, null, 2)}</pre><div className="flex gap-3"><Button disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void decide(row.id, "approve")}>Approve</Button><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void decide(row.id, "reject")}>Reject</Button></div></section>)}<Field label="Decision reason"><textarea className={textareaClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the existing and proposed values and confirm this decision.</label>{notice ? <p role="status">{notice}</p> : null}</Card>;
}
