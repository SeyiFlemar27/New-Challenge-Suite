"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, LinkButton, PageTitle, textareaClass } from "@/components/ui";
type Case = { id: string; targetId: string; source: string; sourceType: string; status: string; reason?: string; reasonCode?: string; updatedAt: string };
export function ChallengeReviewCenter({ initialKind: _initialKind = "all" }: { initialKind?: string }) {
  const auth = useAuth();
  const [selected, setSelected] = useState<Case | null>(null), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [cursor, setCursor] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["challenge-moderation", auth.user?.uid, cursor], enabled: Boolean(auth.user), retry: false, queryFn: async () => {
    const result = await apiRequest<{ cases: Case[]; nextCursor: string | null }>("/api/admin/challenge-reviews" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
    if (!result.ok || !result.data) throw new Error(result.message || "Moderation cases could not be loaded.");
    return result.data;
  } });
  const cases = query.data?.cases ?? [], next = query.data?.nextCursor ?? null;
  const load = () => query.refetch();
  async function decide(action: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await apiRequest("/api/admin/challenge-reviews", { method: "PATCH", body: JSON.stringify({ caseId: selected.id, action, reason, confirmed, expectedUpdatedAt: selected.updatedAt }) });
      setNotice(result.message); if (result.ok) { setSelected(null); await load(); }
    } catch { setNotice("Decision not confirmed. Refresh before retrying."); } finally { setBusy(false); }
  }
  return <><PageTitle title="Challenge moderation" subtitle="Investigate reports, credible safety holds, suspected fraud and creator appeals." /><div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/admin/challenges?view=operations" variant="secondary">Challenge operations</LinkButton><LinkButton href="/admin/tournaments?view=operations" variant="secondary">Tournament operations</LinkButton><LinkButton href="/admin/safety" variant="secondary">Safety reports</LinkButton><LinkButton href="/admin/appeals" variant="secondary">Creator appeals</LinkButton></div><Card className="mt-6 p-5"><p>Ordinary challenges publish after essential checks. Reports request investigation; they do not automatically prove a violation.</p><Button className="mt-4" variant="secondary" onClick={() => void load()}>Refresh cases</Button>{cases.length ? cases.map(row => <section key={row.id} className="my-4 border-t py-4"><p className="font-bold">{row.targetId}</p><p>{row.sourceType.replaceAll("_", " ")} · {row.status}</p><p>{row.reason || row.reasonCode}</p><Button variant="secondary" onClick={() => { setSelected(row); setReason(""); setConfirmed(false); }}>Investigate case</Button></section>) : <p className="mt-5">{query.isPending ? "Loading moderation cases…" : query.error ? query.error.message : "No exception cases on this page."}</p>}<div className="mt-5 flex gap-3"><Button variant="secondary" disabled={!cursor} onClick={() => setCursor(null)}>First page</Button><Button variant="secondary" disabled={!next} onClick={() => setCursor(next)}>Next page</Button></div></Card>{selected ? <Card className="mt-6 space-y-4 p-5"><h2 className="text-xl font-bold">Moderation decision</h2><p>{selected.targetId} · {selected.source}</p><label className="block">Reason<textarea className={textareaClass} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label><label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I investigated the evidence and confirm this action.</label><div className="flex flex-wrap gap-3">{[["hold", "Hold for investigation"], ["remove", "Remove content"], ["release", "Resolve restriction"], ["dismiss", "Dismiss report"]].map(([action, label]) => <Button key={action} variant={action === "remove" ? "destructive" : "secondary"} disabled={busy || !confirmed || reason.trim().length < 8} onClick={() => void decide(action)}>{label}</Button>)}</div></Card> : null}{notice ? <p role="status" className="mt-5">{notice}</p> : null}</>;
}
