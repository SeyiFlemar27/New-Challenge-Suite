"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
export function NormalPublishedDetailsEditor({ challenge, challengeId, onComplete }: { challenge: Record<string, unknown>; challengeId: string; onComplete: () => void }) {
  const [title, setTitle] = useState(String(challenge.title ?? ""));
  const [description, setDescription] = useState(String(challenge.description ?? ""));
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(cancel = false) {
    if (busy || reason.trim().length < 8) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/challenges/${encodeURIComponent(challengeId)}/${cancel ? "lifecycle" : "published-details"}`, { method: cancel ? "POST" : "PATCH", body: JSON.stringify(cancel ? { action: "cancel", reason, confirmed: true } : { title, description, reason, expectedUpdatedAt: challenge.updatedAt }) });
      setNotice(result.message);
      if (result.ok) onComplete();
    } catch { setNotice("The change could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-5 space-y-4 p-5"><h2 className="font-bold">Published description</h2><Field label="Challenge title"><input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></Field><Field label="Full description"><textarea className={textareaClass} value={description} onChange={event => setDescription(event.target.value)} maxLength={1200} /></Field><Field label="Required reason"><input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field><p className="text-sm text-slate-400">Schedules, rules, entry fees, and prize terms need an authorized Admin review. A funded Base Prize and published cash classification cannot be changed here.</p><div className="flex flex-wrap gap-3"><Button disabled={busy || reason.trim().length < 8 || title.trim().length < 3 || description.trim().length < 20} onClick={() => void save()}>Save description</Button>{!challenge.effectiveVotingStartsAt && !["completed", "cancelled", "winners_announced"].includes(String(challenge.status)) ? <Button variant="secondary" disabled={busy || reason.trim().length < 8} onClick={() => void save(true)}>Request cancellation</Button> : null}</div>{notice ? <p role="status">{notice}</p> : null}</Card>;
}
