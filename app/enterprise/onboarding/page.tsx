"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ENTERPRISE_ROLE_LABELS, ENTERPRISE_SCOPE_LABELS, type EnterpriseAccessRecord } from "@/lib/enterprise-access";
import type { EnterpriseOnboardingModule } from "@/lib/enterprise-onboarding";

type OnboardingState = { access: EnterpriseAccessRecord; modules: EnterpriseOnboardingModule[]; completedTaskIds: string[]; completed: boolean; totalTasks: number; completedTasks: number };

export default function EnterpriseOnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<OnboardingState>("/api/enterprise/onboarding").then((result) => result.ok && result.data ? setState(result.data) : setError(result.message)); }, []);
  const progress = useMemo(() => state?.totalTasks ? Math.round((state.completedTasks / state.totalTasks) * 100) : 0, [state]);

  async function toggleTask(taskId: string, completed: boolean) {
    if (state?.modules.flatMap((module) => module.tasks).find((task) => task.id === taskId)?.completionMode === "audited_action") return;
    setBusyTask(taskId); setError("");
    const result = await apiRequest<Omit<OnboardingState, "access">>("/api/enterprise/onboarding", { method: "PATCH", body: JSON.stringify({ taskId, completed }) });
    setBusyTask(null);
    if (!result.ok || !result.data) { setError(result.message); return; }
    setState((current) => current ? { ...current, ...result.data } : current);
  }

  async function complete() {
    setSubmitting(true); setError("");
    const result = await apiRequest<{ completed: boolean }>("/api/enterprise/onboarding", { method: "POST", body: "{}" });
    if (result.ok) router.replace("/enterprise"); else { setError(result.message); setSubmitting(false); }
  }

  if (error && !state) return <AppShell><Card className="mx-auto max-w-3xl p-7"><h1 className="text-2xl font-black text-slate-950">Enterprise onboarding unavailable</h1><p className="mt-3 text-sm text-red-700">{error}</p><div className="mt-6 flex flex-wrap gap-3"><a className="rounded-[8px] bg-[var(--gold)] px-5 py-3 text-sm font-black text-black" href="/dashboard">Personal Workspace</a><a className="rounded-[8px] border border-slate-300 px-5 py-3 text-sm font-black text-slate-950" href="/contact">Contact Support</a></div></Card></AppShell>;
  if (!state) return <AppShell><Card className="mx-auto h-80 max-w-4xl animate-pulse" /></AppShell>;
  return <AppShell><div className="mx-auto max-w-5xl">
    <header className="grid gap-5 rounded-[8px] border border-slate-200 bg-white p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
      <div><div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-slate-950 text-[var(--gold)]"><Building2 size={22} /></div><p className="mt-5 text-xs font-black uppercase text-amber-700">Enterprise onboarding</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Prepare your Enterprise workspace</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Your checklist reflects your real permissions. It does not grant new access or require an assignment before you begin.</p></div>
      <div className="rounded-[8px] bg-slate-950 p-5 text-white"><p className="text-xs font-black uppercase text-amber-300">Your access</p><p className="mt-2 font-black">{ENTERPRISE_ROLE_LABELS[state.access.role]}</p><p className="mt-1 text-sm text-slate-300">{ENTERPRISE_SCOPE_LABELS[state.access.scope]}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-300">{state.completedTasks} of {state.totalTasks} acknowledged</p></div>
    </header>
    <div className="mt-6 grid gap-4">{state.modules.map((module) => <Card key={module.id} className="p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={21} /><div><h2 className="text-lg font-black text-slate-950">{module.title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{module.description}</p></div></div><div className="mt-5 grid gap-3">{module.tasks.map((task) => { const checked = state.completedTaskIds.includes(task.id); return <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-slate-200 p-4 hover:border-amber-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-amber-500" checked={checked} disabled={busyTask === task.id} onChange={(event) => void toggleTask(task.id, event.target.checked)} /><span><span className="block font-bold text-slate-950">{task.title}</span><span className="mt-1 block text-sm leading-6 text-slate-600">{task.description}</span></span>{checked ? <Check className="ml-auto shrink-0 text-emerald-600" size={18} aria-label="Acknowledged" /> : null}</label>; })}</div></Card>)}</div>
    {error ? <p role="alert" className="mt-5 rounded-[8px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</p> : null}
    <div className="mt-6 flex justify-end"><Button disabled={!state.completed || submitting} onClick={() => void complete()}>{submitting ? "Opening Enterprise Studio..." : "Complete onboarding"}</Button></div>
  </div></AppShell>;
}
