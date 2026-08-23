"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ENTERPRISE_ROLE_LABELS, ENTERPRISE_SCOPE_LABELS, type EnterpriseAccessRecord } from "@/lib/enterprise-access";

export default function EnterpriseOnboardingPage() {
  const router = useRouter(); const [access, setAccess] = useState<EnterpriseAccessRecord | null>(null); const [step, setStep] = useState(0); const [error, setError] = useState("");
  useEffect(() => { apiRequest<{ access: EnterpriseAccessRecord }>("/api/enterprise/workspace").then((result) => result.ok && result.data ? setAccess(result.data.access) : setError(result.message)); }, []);
  async function complete() { const result = await apiRequest<{ completed: boolean }>("/api/enterprise/onboarding", { method: "POST", body: "{}" }); if (result.ok) router.replace("/enterprise"); else setError(result.message); }
  if (!access) return <AppShell><Card className="mx-auto h-80 max-w-2xl animate-pulse" /></AppShell>;
  const screens = [{ icon: Building2, title: "Welcome to Challenge Suite Enterprise", body: "This is your staff workspace for official challenges and assigned operations." }, { icon: ShieldCheck, title: `Your role: ${ENTERPRISE_ROLE_LABELS[access.role]}`, body: "Your role provides a focused permission baseline. Admin authorization remains separate." }, { icon: CheckCircle2, title: `Your access: ${ENTERPRISE_SCOPE_LABELS[access.scope]}`, body: `${access.categoryScope.length ? access.categoryScope.join(", ") : "All permitted categories"} · ${access.regionScope.length ? access.regionScope.join(", ") : "All permitted regions"}` }, { icon: UsersRound, title: access.department || "Your team", body: "Assignments and internal notes are visible only within authorized Enterprise operations." }];
  const current = screens[step]; const Icon = current.icon;
  return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><p className="text-xs font-black uppercase text-amber-700">Enterprise onboarding · {step + 1} of {screens.length}</p><Icon className="mx-auto mt-8 h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black text-slate-950">{current.title}</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{current.body}</p>{error ? <p className="mt-5 text-sm text-red-700">{error}</p> : null}<div className="mt-8 flex justify-center gap-3"><Button variant="secondary" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>{step < screens.length - 1 ? <Button onClick={() => setStep((value) => value + 1)}>Continue</Button> : <Button onClick={() => void complete()}>Go to Enterprise Studio</Button>}</div></Card></AppShell>;
}
