"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, textareaClass } from "@/components/ui";
export function NormalSubmissionAppeal({ submissionId, admin = false, onComplete }: { submissionId: string; admin?: boolean; onComplete?: () => void }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(decision?: "approve" | "uphold") {
    if (busy || reason.trim().length < 8 || (admin && !confirmed)) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/submissions/${encodeURIComponent(submissionId)}/appeal`, { method: admin ? "PATCH" : "POST", body: JSON.stringify({ reason, decision, confirmed }) });
      setMessage(result.message ?? (result.ok ? "Appeal recorded." : "The appeal could not be recorded."));
      if (result.ok) onComplete?.();
    } catch { setMessage("The appeal could not be recorded. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-[var(--gold)]/30 p-4"><h3 className="font-bold">{admin ? "Review submission appeal" : "Appeal final rejection"}</h3><label className="block text-sm">{admin ? "Required decision reason" : "Explain your appeal"}<textarea className={`${textareaClass} mt-2`} value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} /></label>{admin ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the submission and evidence and confirm this decision.</label> : <p className="text-sm text-slate-400">Appeals must be filed within 24 hours of final rejection. Filing does not approve the submission.</p>}<div className="flex flex-wrap gap-3">{admin ? <><Button disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void send("approve")}>Approve submission</Button><Button variant="secondary" disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void send("uphold")}>Uphold rejection</Button></> : <Button disabled={busy || reason.trim().length < 8} onClick={() => void send()}>Submit appeal</Button>}</div>{message ? <p role="status" className="text-sm">{message}</p> : null}</section>;
}
