"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, PageTitle, inputClass } from "@/components/ui";

export default function TournamentRuntimeVerificationPage() {
  const [reason, setReason] = useState(""), [id, setId] = useState(""), [retryOnce, setRetryOnce] = useState(false);
  const [busy, setBusy] = useState(false), [created, setCreated] = useState(0), [notice, setNotice] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  async function run(action: string) {
    if (busy || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const response = await apiRequest<Record<string, unknown>>("/api/admin/tournament-runtime-verification", { method: "POST", body: JSON.stringify({ action, reason, id, retryOnce }) });
      setNotice(response.message);
      setResult(response.data ?? null);
      if (response.ok && action === "create" && typeof response.data?.id === "string") { setId(response.data.id); setCreated(count => count + 1); }
      if (response.ok && action === "cleanup") setId("");
    } catch { setNotice("Verification was not confirmed. Refresh its status before retrying."); }
    finally { setBusy(false); }
  }
  const disabled = busy || reason.trim().length < 10;
  return <><PageTitle title="Isolated Tournament runtime verification" subtitle="Restricted synthetic transport test. Production scheduling and registration remain disabled." />
    <Card className="mt-6 space-y-4 p-5">
      <p>This tool accesses only reserved synthetic verification records and their test tasks. It does not run competition reconciliation, change readiness, enable flags or resume Scheduler. Recent Admin authentication is required.</p>
      <Field label="Verification reason"><input className={inputClass} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></Field>
      <label className="flex gap-3"><input type="checkbox" checked={retryOnce} disabled={Boolean(id) || busy} onChange={event => setRetryOnce(event.target.checked)} />Request one synthetic retry before completion</label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={disabled} onClick={() => void run("access")}>Inspect runtime permissions</Button>
        <Button disabled={disabled || Boolean(id) || created >= 2} onClick={() => void run("create")}>Create synthetic run</Button>
        <Button disabled={disabled || !id} onClick={() => void run("dispatch")}>Dispatch test task</Button>
        <Button disabled={disabled || !id} onClick={() => void run("recovery")}>Recover isolated job</Button>
        <Button disabled={disabled || !id} onClick={() => void run("status")}>Refresh test status</Button>
        <Button variant="secondary" disabled={disabled || !id} onClick={() => void run("cleanup")}>Delete synthetic run</Button>
      </div>
      <Field label="Existing synthetic run ID"><input className={inputClass} value={id} placeholder="release-probe_UUID" maxLength={60} onChange={event => setId(event.target.value)} /></Field>
      <p>At most two new runs in this session. Cleanup removes only the selected marked synthetic record; operational audit entries are retained. Refreshing this page does not clean up a run—retain its ID until cleanup is confirmed.</p>
      {notice ? <p role="status">{notice}</p> : null}
      {result ? <pre aria-label="Synthetic verification result" className="overflow-auto whitespace-pre-wrap break-all rounded p-4 text-sm">{JSON.stringify(result, null, 2)}</pre> : null}
    </Card></>;
}
