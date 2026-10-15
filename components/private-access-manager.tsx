"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass } from "@/components/ui";

type AccessData = { enrollmentOpen: boolean; publicPreviewEnabled: boolean; nextRequestCursor: string | null; nextParticipantCursor: string | null; requests: { id: string; userId: string; reason: string; status: string; decisionReason: string; joined: boolean }[]; participants: { id: string; userId: string; status: string }[] };
export function PrivateAccessManager({ challengeId }: { challengeId: string }) {
  const client = useQueryClient();
  const path = `/api/private-challenges/${encodeURIComponent(challengeId)}/access`;
  const [requestPages, setRequestPages] = useState([""]);
  const [participantPages, setParticipantPages] = useState([""]);
  const query = useQuery({ queryKey: ["private-access-manager", challengeId, requestPages.at(-1), participantPages.at(-1)], queryFn: () => apiRequest<AccessData>(`${path}?requestCursor=${encodeURIComponent(requestPages.at(-1) ?? "")}&participantCursor=${encodeURIComponent(participantPages.at(-1) ?? "")}`) });
  const [pending, setPending] = useState<{ action: string; requestId?: string; visible?: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const data = query.data?.data;
  async function copyCredential() {
    setBusy(true);
    try {
      const result = await apiRequest<{ method: string; credential: string }>(`${path}?share=true`, { cache: "no-store" });
      if (!result.ok || !result.data) { setMessage(result.message || "Sharing is unavailable."); return; }
      await navigator.clipboard.writeText(result.data.method === "invite_link" ? `${window.location.origin}/private/invite/${encodeURIComponent(result.data.credential)}` : result.data.credential);
      setMessage("Credential copied. Share it securely. Access does not join the challenge.");
    } catch { setMessage("Copy failed. Check browser clipboard permission and retry."); }
    finally { setBusy(false); }
  }
  function choose(action: string, requestId?: string, visible?: boolean) { setPending({ action, requestId, visible }); setReason(""); setConfirmed(false); setMessage(""); }
  async function execute() {
    if (!pending || !reason.trim() || !confirmed) return;
    setBusy(true);
    try { const result = await apiRequest(path, { method: "POST", body: JSON.stringify({ ...pending, reason, confirmed }) }); setMessage(result.message || "No result confirmed."); if (result.ok) { setPending(null); await client.invalidateQueries({ queryKey: ["private-access-manager", challengeId] }); } }
    finally { setBusy(false); }
  }
  return <Card className="my-6 space-y-5 p-5"><h2 className="text-xl font-black">Share &amp; Manage Access</h2>
    {query.isLoading ? <p aria-busy="true">Loading access management…</p> : !data ? <p role="alert">{query.data?.message || "Access management is unavailable."}</p> : <>
      <p className="text-sm">{data.enrollmentOpen ? "Registration is open. Grants do not reserve places; participants must still join or pay." : "New grants and credential sharing are closed until published registration is open."}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !data.enrollmentOpen} onClick={() => void copyCredential()}>Copy selected invitation</Button><Button variant="secondary" disabled={busy || !data.enrollmentOpen} onClick={() => choose("rotate")}>Regenerate credential</Button><Button variant="secondary" disabled={busy} onClick={() => choose("visibility", undefined, !data.publicPreviewEnabled)}>{data.publicPreviewEnabled ? "Hide from Explore" : "Make visible on Explore"}</Button></div>
      <p className="text-sm text-slate-500">Regeneration invalidates the previous credential. Existing access and joined participants are preserved. Visibility cannot change during voting.</p>
      <h3 className="font-black">Access requests</h3>{data.requests.length ? data.requests.map((item) => <section key={item.id} className="rounded-lg border p-4"><p className="font-bold">{item.userId} · {item.joined ? "Joined" : item.status.replaceAll("_", " ")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.reason}</p>{item.decisionReason ? <p className="mt-2 text-sm">Decision: {item.decisionReason}</p> : null}<div className="mt-3 flex flex-wrap gap-2">{(item.status === "pending_review" ? ["approve", "reject"] : item.status === "approved" ? ["revoke"] : ["rejected", "revoked"].includes(item.status) ? ["restore"] : []).map((action) => <Button key={action} variant="secondary" disabled={busy || item.joined || !data.enrollmentOpen} onClick={() => choose(action, item.id)}>{action[0].toUpperCase() + action.slice(1)}</Button>)}</div></section>) : <p className="text-sm">No access requests.</p>}
      <h3 className="font-black">Joined participants</h3>{data.participants.length ? <ul className="space-y-2 text-sm">{data.participants.map((item) => <li key={item.id}>{item.userId} · Joined · {item.status}</li>)}</ul> : <p className="text-sm">No joined participants. Invitation redeemers are not listed.</p>}
      <nav aria-label="Access management pages" className="flex flex-wrap gap-2"><Button variant="secondary" disabled={requestPages.length < 2} onClick={() => setRequestPages((pages) => pages.slice(0, -1))}>Previous requests</Button><Button variant="secondary" disabled={!data.nextRequestCursor} onClick={() => setRequestPages((pages) => [...pages, data.nextRequestCursor!])}>Next requests</Button><Button variant="secondary" disabled={participantPages.length < 2} onClick={() => setParticipantPages((pages) => pages.slice(0, -1))}>Previous participants</Button><Button variant="secondary" disabled={!data.nextParticipantCursor} onClick={() => setParticipantPages((pages) => [...pages, data.nextParticipantCursor!])}>Next participants</Button></nav>
    </>}
    {pending ? <section className="space-y-3 rounded-lg border border-amber-400 p-4" aria-label="Confirm access change"><h3 className="font-black">Confirm {pending.action}</h3><Field label="Decision reason"><input autoFocus className={inputClass} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></Field><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this access change.</label><div className="flex gap-3"><Button disabled={busy || !confirmed || !reason.trim()} onClick={() => void execute()}>Confirm change</Button><Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button></div></section> : null}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </Card>;
}
