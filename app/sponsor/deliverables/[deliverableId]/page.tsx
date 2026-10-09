"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Clock3 } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label } from "@/lib/sponsor-collaboration";

export default function SponsorDeliverableDetailPage() {
  const params = useParams<{ deliverableId: string }>();
  const query = useQuery({ queryKey: ["sponsor-deliverable-detail", params.deliverableId], queryFn: async () => Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ deliverable: any; revisions: any[] }>(`/api/sponsor/deliverables/${params.deliverableId}`)]) });
  const profile = query.data?.[0].data?.sponsorProfile ?? null;
  const deliverable = query.data?.[1].data?.deliverable ?? null;
  const revisions = query.data?.[1].data?.revisions ?? [];
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");
  async function update(status: string) { const result = await apiRequest(`/api/sponsor/deliverables/${params.deliverableId}`, { method: "PATCH", body: JSON.stringify({ status, sponsorFeedback: feedback, revisionNumber: Number(deliverable?.revisionNumber ?? 1) + 1 }) }); setNotice(result.message); if (result.ok) { setFeedback(""); await query.refetch(); } }
  return <SponsorShell profile={profile}>{query.isLoading ? <Card className="h-96 animate-pulse bg-[#171717]" /> : <div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Deliverable Detail</p><h1 className="mt-3 text-4xl font-black">{deliverable?.title || "Deliverable"}</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">{deliverable?.description || "No description yet."}</p></div><LinkButton href="/sponsor/deliverables" variant="secondary">All Deliverables</LinkButton></div>{notice ? <Card className="mt-6 p-4 text-sm text-slate-300">{notice}</Card> : null}<div className="mt-8 grid gap-5 md:grid-cols-4"><Metric label="Status" value={label(deliverable?.status)} /><Metric label="Due Date" value={deliverable?.dueDate || "Not scheduled"} /><Metric label="Revision" value={String(deliverable?.revisionNumber ?? 1)} /><Metric label="Payment" value="Not active" /></div><Card className="mt-8 p-6"><h2 className="text-2xl font-black">Sponsor review actions</h2><p className="mt-2 text-sm leading-6 text-slate-400">Approval records creative acceptance only. Payment release is handled separately after funding and contract setup.</p><Field label="Feedback"><textarea className={textareaClass} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></Field><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => void update("approved")}>Approve</Button><Button variant="secondary" onClick={() => void update("changes_requested")}>Request Changes</Button><Button variant="ghost" onClick={() => void update("under_review")}>Mark Reviewed</Button></div></Card><Card className="mt-8 p-6"><h2 className="text-2xl font-black">Revision timeline</h2><div className="mt-5 space-y-3">{revisions.length ? revisions.map((item) => <div key={item.id} className="flex gap-3 rounded-[8px] bg-black/30 p-4"><Clock3 size={17} className="mt-1 shrink-0 text-[var(--gold)]" /><div><p className="font-black">{label(item.status)}</p><p className="mt-1 text-sm text-slate-400">{item.feedback || "Revision record"}</p><p className="mt-1 text-xs text-slate-500">{item.createdAt}</p></div></div>) : <p className="text-sm text-slate-500">No revisions yet.</p>}</div></Card></div>}</SponsorShell>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-[var(--gold)]">{value}</p></Card>; }


