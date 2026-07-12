"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3 } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label } from "@/lib/sponsor-collaboration";

export default function SponsorApprovalDetailPage() {
  const params = useParams<{ approvalId: string }>();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { const [profileResult, result] = await Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ approval: any; activity: any[]; comments: any[] }>(`/api/sponsor/approvals/${params.approvalId}`)]); if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile); if (result.ok && result.data) { setApproval(result.data.approval); setActivity(result.data.activity); setComments(result.data.comments); } else setNotice(result.message || "Approval item could not be loaded."); setLoading(false); }
  useEffect(() => { void load(); }, [params.approvalId]);
  async function update(status: string) { const result = await apiRequest(`/api/sponsor/approvals/${params.approvalId}`, { method: "PATCH", body: JSON.stringify({ status, feedback }) }); setNotice(result.message); if (result.ok) { setFeedback(""); void load(); } }
  return <SponsorShell profile={profile}>{loading ? <Card className="h-96 animate-pulse bg-[#171717]" /> : <div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Approval Detail</p><h1 className="mt-3 text-4xl font-black">{approval?.title || "Approval item"}</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">{approval?.previewFoundation || "Preview foundation pending."}</p></div><LinkButton href="/sponsor/approvals" variant="secondary">Approval Center</LinkButton></div>{notice ? <Card className="mt-6 p-4 text-sm text-slate-300">{notice}</Card> : null}<div className="mt-8 grid gap-5 md:grid-cols-4"><Metric label="Status" value={label(approval?.status)} /><Metric label="Type" value={label(approval?.type)} /><Metric label="Deadline" value={approval?.deadline || "Not scheduled"} /><Metric label="Release" value="Not active" /></div><Card className="mt-8 p-6"><h2 className="text-2xl font-black">Review action</h2><p className="mt-2 text-sm text-slate-400">Approval updates status and audit activity only. It does not release money, sign a contract, or publish a campaign.</p><Field label="Feedback / comment foundation"><textarea className={textareaClass} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></Field><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => void update("approved")}>Approve</Button><Button variant="secondary" onClick={() => void update("changes_requested")}>Request Changes</Button><Button variant="ghost" onClick={() => void update("rejected")}>Reject</Button></div></Card><div className="mt-8 grid gap-8 xl:grid-cols-2"><Timeline title="Approval history" items={activity} /><Timeline title="Comments foundation" items={comments} /></div></div>}</SponsorShell>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-[var(--gold)]">{value}</p></Card>; }
function Timeline({ title, items }: { title: string; items: any[] }) { return <Card className="p-6"><h2 className="text-2xl font-black">{title}</h2><div className="mt-5 space-y-3">{items.length ? items.map((item) => <div key={item.id} className="flex gap-3 rounded-[8px] bg-black/30 p-4"><Clock3 size={17} className="mt-1 shrink-0 text-[var(--gold)]" /><div><p className="font-black">{label(item.status ?? item.action)}</p><p className="mt-1 text-sm text-slate-400">{item.feedback || item.body || "Foundation activity"}</p><p className="mt-1 text-xs text-slate-500">{item.createdAt}</p></div></div>) : <p className="text-sm text-slate-500">No records yet.</p>}</div></Card>; }
