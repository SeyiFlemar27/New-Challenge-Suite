"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, FileCheck2, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ENTERPRISE_ROLE_LABELS, ENTERPRISE_SCOPE_LABELS, type EnterpriseAccessRecord } from "@/lib/enterprise-access";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

type ChallengeSummary = { id: string; title: string; displayStatus: string; category: string; assignment?: string | null; needsAttention?: boolean };
type Workspace = { access: EnterpriseAccessRecord; metrics: { activeOfficialChallenges: number; participants: number; submissions: number; needsAttention: number }; attention: ChallengeSummary[]; assigned: ChallengeSummary[]; official: ChallengeSummary[] };

function ChallengeRow({ challenge }: { challenge: ChallengeSummary }) {
  return <a href={`/challenges/${challenge.id}/manage`} className="flex min-h-16 items-center justify-between gap-4 border-b border-black/10 py-4 last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]"><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{challenge.title}</b><small className="mt-1 block text-slate-500">{challenge.assignment ?? challenge.category} · {challenge.displayStatus}</small></span><ArrowRight className="shrink-0 text-slate-400" size={18} /></a>;
}

export default function EnterpriseStudioPage() {
  const { user, loading } = useCurrentUser();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (user && !loading) apiRequest<Workspace>("/api/enterprise/workspace").then((result) => result.ok && result.data ? setWorkspace(result.data) : setError(result.message || "Enterprise Studio could not be loaded.")); }, [user, loading]);
  const approved = [user?.enterpriseAccessStatus, user?.enterpriseApprovalStatus].some((value) => String(value ?? "").toLowerCase() === "approved");
  if (loading) return <AppShell><Card className="mx-auto h-80 max-w-7xl animate-pulse" /></AppShell>;
  if (!approved) return <AppShell><Card className="mx-auto max-w-3xl p-8 text-center"><Building2 className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black text-slate-950">Enterprise access required</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Enterprise Studio is provisioned only after an authorized Admin decision.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><LinkButton href="/enterprise/apply">Apply for Enterprise Access</LinkButton><LinkButton href="/enterprise/status" variant="secondary">View Application</LinkButton></div></Card></AppShell>;
  if (error) return <AppShell><Card className="mx-auto max-w-3xl p-7"><AlertCircle className="text-red-600" /><h1 className="mt-4 text-2xl font-black text-slate-950">Enterprise Studio unavailable</h1><p className="mt-2 text-slate-600">{error}</p><LinkButton href="/contact" className="mt-6">Contact Support</LinkButton></Card></AppShell>;
  if (!workspace) return <AppShell><Card className="mx-auto h-80 max-w-7xl animate-pulse" /></AppShell>;
  if (!workspace.access.onboardingComplete) return <AppShell><Card className="mx-auto max-w-3xl p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-3xl font-black text-slate-950">Welcome to Challenge Suite Enterprise</h1><p className="mt-3 text-slate-600">Review your staff role and access before opening Enterprise Studio.</p><LinkButton href="/enterprise/onboarding" className="mt-7">Review My Access</LinkButton></Card></AppShell>;
  const metrics = [["Active Official Challenges", workspace.metrics.activeOfficialChallenges, Building2], ["Participants", workspace.metrics.participants, UsersRound], ["Submissions", workspace.metrics.submissions, FileCheck2], ["Needs Attention", workspace.metrics.needsAttention, AlertCircle]] as const;
  return <AppShell><div className="mx-auto max-w-7xl" data-enterprise-studio><PageTitle title="Enterprise Studio" subtitle="Manage your challenges, assigned work and Challenge Suite operations." icon={<Building2 className="text-[var(--gold)]" />} /><div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600"><span>{ENTERPRISE_ROLE_LABELS[workspace.access.role]}</span><span>·</span><span>{workspace.access.department}</span><span>·</span><span>{ENTERPRISE_SCOPE_LABELS[workspace.access.scope]}</span></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Enterprise Studio metrics">{metrics.map(([label, value, Icon]) => <Card key={label} className="p-5"><Icon className="text-[var(--gold)]" size={20} /><p className="mt-5 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-600">{label}</p></Card>)}</section>
    <section className="mt-8 grid gap-6 xl:grid-cols-2"><Card className="p-6"><p className="text-xs font-black uppercase text-amber-700">Today</p><h2 className="mt-1 text-xl font-black text-slate-950">Needs Attention</h2>{workspace.attention.length ? <div className="mt-4">{workspace.attention.map((item) => <ChallengeRow key={item.id} challenge={item} />)}</div> : <p className="mt-6 text-sm text-slate-600">You’re all caught up.</p>}</Card><Card className="p-6"><h2 className="text-xl font-black text-slate-950">My Work</h2><p className="mt-1 text-sm text-slate-600">Official challenges assigned to your staff role.</p>{workspace.assigned.length ? <div className="mt-4">{workspace.assigned.map((item) => <ChallengeRow key={item.id} challenge={item} />)}</div> : <p className="mt-6 text-sm text-slate-600">No assigned challenges right now.</p>}<LinkButton href="/enterprise/assigned" variant="secondary" className="mt-5">Assigned to Me</LinkButton></Card></section>
    <section className="mt-8"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black text-slate-950">Official Challenges</h2><p className="mt-1 text-sm text-slate-600">Challenge Suite organizational work visible within your scope.</p></div>{workspace.access.permissions.includes("challenge.create_official") ? <LinkButton href="/enterprise/challenges/create">Create Challenge</LinkButton> : null}</div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workspace.official.map((item) => <Card key={item.id} className="p-5"><ChallengeRow challenge={item} /></Card>)}{!workspace.official.length ? <Card className="p-6 text-sm text-slate-600">No official challenges are available in your scope.</Card> : null}</div></section>
  </div></AppShell>;
}
