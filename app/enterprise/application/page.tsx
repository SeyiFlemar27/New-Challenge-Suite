"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Application = Record<string, unknown> & { id: string };

const fields: Array<[string, string]> = [
  ["fullName", "Full name"], ["workEmail", "Work email"], ["company", "Organization / team"], ["roleTitle", "Role / position"],
  ["expectedChallengeVolume", "Expected use"], ["teamSize", "Team size"], ["useCase", "Reason for access"], ["relationship", "Relationship to Challenge Suite"], ["contactDetails", "Message / notes"]
];

function applicationValue(application: Application, key: string) {
  if (application[key] !== null && application[key] !== undefined) return String(application[key]);
  const submitted = application.submittedFields;
  return submitted && typeof submitted === "object" && !Array.isArray(submitted)
    ? String((submitted as Record<string, unknown>)[key] ?? "")
    : "";
}

export default function EnterpriseApplicationPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<{ application: Application | null }>("/api/enterprise-inquiries").then((result) => { setLoading(false); if (!result.ok) return setError(result.message); setApplication(result.data?.application ?? null); }); }, []);
  const status = String(application?.status ?? "not_submitted");
  const editable = ["needs_info", "requested_changes", "rejected", "withdrawn"].includes(status);
  return <AppShell><div className="mx-auto max-w-4xl"><PageTitle title="Enterprise application" subtitle="Review the application currently linked to your account." icon={<Building2 className="text-[var(--gold)]" />} />{loading ? <Card className="mt-8 h-72 animate-pulse" /> : error ? <Card className="mt-8 p-6 text-red-700">{error}</Card> : !application ? <Card className="mt-8 p-7"><p>No Enterprise application is available.</p><LinkButton className="mt-5" href="/enterprise/apply">Apply for Enterprise Access</LinkButton></Card> : <Card className="mt-8 p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{status.replaceAll("_", " ")}</p><h2 className="mt-2 text-2xl font-black">{String(application.company ?? "Enterprise application")}</h2></div><p className="text-sm text-slate-500">Revision {String(application.currentRevision ?? application.version ?? 1)}</p></div><dl className="mt-7 grid gap-5 sm:grid-cols-2">{fields.map(([key, label]) => { const value = applicationValue(application, key); return value ? <div key={key} className="border-t border-black/10 pt-4"><dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value}</dd></div> : null; })}</dl><div className="mt-7 flex flex-wrap gap-3">{editable ? <LinkButton href="/enterprise/application/edit">Edit Application</LinkButton> : null}<LinkButton href="/enterprise/status" variant="secondary">Application Status</LinkButton><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton></div></Card>}</div></AppShell>;
}
