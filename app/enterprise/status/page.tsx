"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Application = Record<string, unknown> & { id: string; status?: string };

export default function EnterpriseStatusPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<{ application: Application | null }>("/api/enterprise-inquiries").then((result) => { setLoading(false); if (!result.ok) return setError(result.message); setApplication(result.data?.application ?? null); }); }, []);
  const status = String(application?.status ?? application?.approvalStatus ?? "not_submitted");
  const needsInfo = ["needs_info", "requested_changes"].includes(status);
  return <AppShell><div className="mx-auto max-w-4xl"><PageTitle title="Enterprise application" subtitle="Track the review status of your application." icon={<ClipboardCheck className="text-[var(--gold)]" />} />{loading ? <Card className="mt-8 h-52 animate-pulse" /> : error ? <Card className="mt-8 p-6 text-red-200">{error}</Card> : !application ? <Card className="mt-8 p-7"><h2 className="text-2xl font-black">No application yet</h2><p className="mt-3 text-slate-300">Apply when your team is ready for Enterprise review.</p><LinkButton href="/enterprise/apply" className="mt-6">Apply for Enterprise Access</LinkButton></Card> : <Card className="mt-8 p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{needsInfo ? "Needs information" : status === "approved" ? "Approved" : status === "rejected" ? "Not approved" : "Pending review"}</p><h2 className="mt-3 text-2xl font-black">{status === "approved" ? "Enterprise access approved" : needsInfo ? "Please update your application" : status === "rejected" ? "Application reviewed" : "Enterprise application submitted"}</h2><p className="mt-3 text-sm leading-6 text-slate-300">{status === "approved" ? "Enterprise is now available in Switch Role." : needsInfo ? "An administrator requested more information before continuing the review." : status === "rejected" ? "Contact Support if you need help understanding the decision." : "We'll notify you when your application has been reviewed. You can continue using your normal account while this is being reviewed."}</p><div className="mt-6 flex flex-wrap gap-3">{status === "approved" ? <LinkButton href="/enterprise/dashboard">Open Enterprise</LinkButton> : null}{needsInfo ? <LinkButton href={`/enterprise/apply?application=${application.id}`}>Update Application</LinkButton> : null}<LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="secondary">Contact Support</LinkButton></div></Card>}</div></AppShell>;
}
