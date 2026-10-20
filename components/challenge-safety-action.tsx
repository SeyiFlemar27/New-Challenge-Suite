"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { Button, Field, textareaClass } from "@/components/ui";
export function ChallengeSafetyAction({ challengeId, source = "challenges", appeal = false }: { challengeId: string; source?: "challenges" | "tournaments"; appeal?: boolean }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  if (!auth.user) return null;
  async function send() {
    setBusy(true);
    try {
      const result = await apiRequest(`/api/challenges/${encodeURIComponent(challengeId)}/${appeal ? "moderation-appeal" : "report"}`, { method: "POST", body: JSON.stringify({ source, reason }) });
      setNotice(result.message); if (result.ok) { setOpen(false); setReason(""); }
    } catch { setNotice("The request was not confirmed. Please retry."); } finally { setBusy(false); }
  }
  return <div className="my-4 space-y-3"><Button variant="ghost" onClick={() => setOpen(value => !value)}>{appeal ? "Appeal moderation restriction" : "Report a safety concern"}</Button>{open ? <form className="max-w-xl space-y-3" onSubmit={event => { event.preventDefault(); void send(); }}><Field label={appeal ? "Appeal details" : "Safety concern"}><textarea className={textareaClass} value={reason} minLength={10} maxLength={2000} required onChange={event => setReason(event.target.value)} /></Field><p className="text-sm text-[var(--muted)]">{appeal ? "An administrator will investigate the restriction and your explanation." : "Explain the specific concern. A report requests human investigation."}</p><Button type="submit" disabled={busy || reason.trim().length < 10}>{busy ? "Sending…" : appeal ? "Submit appeal" : "Submit safety report"}</Button></form> : null}{notice ? <p role="status">{notice}</p> : null}</div>;
}
