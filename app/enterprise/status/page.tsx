"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatAppDateTime } from "@/lib/utils";

type Application = Record<string, unknown> & { id: string; status?: string };

export default function EnterpriseStatusPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState<Array<{ type: string; status: string; at: string; message: string }>>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  function load() { void apiRequest<{ application: Application | null; timeline?: Array<{ type: string; status: string; at: string; message: string }> }>("/api/enterprise-inquiries").then((result) => { setLoading(false); if (!result.ok) return setError(result.message); setApplication(result.data?.application ?? null); setTimeline(result.data?.timeline ?? []); }); }
  useEffect(load, []);
  const status = String(application?.status ?? application?.approvalStatus ?? "not_submitted");
  const needsInfo = ["needs_info", "requested_changes"].includes(status);
  const pending = ["pending", "in_review"].includes(status);
  const withdrawn = status === "withdrawn";
  const title = status === "approved" ? "Enterprise access approved" : needsInfo ? "More information needed" : status === "rejected" ? "Enterprise application not approved" : withdrawn ? "Enterprise application withdrawn" : "Enterprise application submitted";
  const message = status === "approved" ? "You can now access your Enterprise workspace." : needsInfo ? "Please update your application so we can continue the review." : status === "rejected" ? "You can revise this application and submit it for another review." : withdrawn ? "You can revise and reapply when your team is ready." : "We'll notify you when your application has been reviewed.";
  async function withdraw() { if (!application || !window.confirm("Withdraw this Enterprise application?")) return; setWithdrawing(true); const result = await apiRequest("/api/enterprise-inquiries", { method: "PATCH", body: JSON.stringify({ id: application.id, action: "withdraw", expectedVersion: application.version ?? application.currentRevision }) }); setWithdrawing(false); if (!result.ok) return setError(result.message); setError(""); setLoading(true); load(); }
  return <AppShell><div className="mx-auto max-w-4xl"><PageTitle title="Enterprise application" subtitle="Track the review status of your application." icon={<ClipboardCheck className="text-[var(--gold)]" />} />{loading ? <Card className="mt-8 h-52 animate-pulse" /> : error ? <Card className="mt-8 p-6 text-red-700">{error}</Card> : !application ? <Card className="mt-8 p-7"><h2 className="text-2xl font-black">No application yet</h2><p className="mt-3 text-slate-600">Apply when your team is ready for Enterprise review.</p><LinkButton href="/enterprise/apply" className="mt-6">Apply for Enterprise Access</LinkButton></Card> : <div className="mt-8 grid gap-6"><Card className="p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{needsInfo ? "Needs Info" : status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : withdrawn ? "Withdrawn" : "Pending review"}</p><h2 className="mt-3 text-2xl font-black">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>{pending ? <p className="mt-2 text-sm leading-6 text-slate-500">You can continue using your normal account while this is being reviewed.</p> : null}<div className="mt-6 flex flex-wrap gap-3">{status === "approved" ? <LinkButton href="/enterprise/dashboard">Open Enterprise</LinkButton> : null}<LinkButton href="/enterprise/application" variant="secondary">View Application</LinkButton>{needsInfo || status === "rejected" || withdrawn ? <LinkButton href="/enterprise/application/edit">Edit Application</LinkButton> : null}{pending ? <Button variant="secondary" onClick={withdraw} disabled={withdrawing}>{withdrawing ? "Withdrawing..." : "Withdraw Application"}</Button> : null}<LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton>{status !== "approved" ? <LinkButton href="/contact" variant="secondary">Contact Support</LinkButton> : null}</div></Card>{timeline.length ? <Card className="p-7"><h2 className="text-lg font-black">Application timeline</h2><div className="mt-5 space-y-4">{[...timeline].reverse().map((event, index) => <div className="border-l-2 border-[var(--gold)] pl-4" key={`${event.type}-${event.at}-${index}`}><p className="font-bold">{event.message}</p><p className="mt-1 text-xs text-slate-500">{event.at ? formatAppDateTime(event.at) : "Time unavailable"}</p></div>)}</div></Card> : null}</div>}</div></AppShell>;
}
