"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Button, Card, Field, inputClass, LinkButton } from "@/components/ui";
import { MediaUploadField } from "@/components/media-upload-field";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";
import { profileMediaPath } from "@/lib/media-upload-paths";

const hostTypes = ["Online challenges", "Live events", "Tournaments", "School competitions", "Talent shows", "Pageants", "Sports competitions", "Business pitch competitions", "Community contests", "Other"];
const hostAccess = ["Competition builder", "Participant management", "Submission review", "Voting control", "Live event tools", "Reports and results"] as const;

export default function HostOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ organizationName: "", eventBrandName: "", location: "", contactEmail: user?.email ?? "", publicProfileUrl: "", logoUrl: "", hostType: "Online challenges", competitionSize: "under_50", votingPreference: "public", eventMode: "online", revenueAcknowledged: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const update = (field: string, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  async function complete(destination: string) {
    setSaving(true);
    setError("");
    const result = await apiRequest<{ destination: string }>("/api/onboarding", { method: "POST", body: JSON.stringify({ type: "host", ...form, contactEmail: form.contactEmail || user?.email || "" }) });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    router.replace(destination);
  }

  if (loading) return <OnboardingShell eyebrow="Host Plan" title="Preparing Host Control Center" subtitle="Loading your verified plan access." currentStep={1} totalSteps={5}><Card className="h-[520px] animate-pulse" /></OnboardingShell>;
  if (tier.id !== "host") {
    return <OnboardingShell eyebrow="Plan verification" title="Host Plan required" subtitle="Host onboarding opens only after verified Stripe activation." currentStep={1} totalSteps={5}><Card className="p-8 text-center"><LockKeyhole className="mx-auto text-[var(--gold)]" size={44} /><p className="mt-5 text-slate-300">Your current account access remains active.</p><LinkButton href="/subscriptions" className="mt-6">Upgrade to Host</LinkButton></Card></OnboardingShell>;
  }

  const workspaceValid = form.organizationName.trim().length >= 2 && form.location.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.contactEmail || user?.email || "");

  return (
    <OnboardingShell
      eyebrow="Host Plan activated"
      title={step === 1 ? "Welcome to Host Plan" : step === 2 ? "Build your host workspace" : step === 3 ? "Set your competition defaults" : step === 4 ? "Understand the safety model" : "Choose your first operation"}
      subtitle={step === 1 ? "You can now run serious competitions, manage participants, control voting, create live events, and review competition reports." : "A focused workspace keeps every competition, participant, and decision organized."}
      currentStep={step}
      totalSteps={5}
    >
      {step === 1 ? <div className="grid gap-4 sm:grid-cols-2">{hostAccess.map((title) => <Card key={title} className="flex min-h-24 items-center p-5"><h2 className="font-black">{title}</h2></Card>)}<Card className="border-yellow-500/20 bg-yellow-500/5 p-5 sm:col-span-2"><p className="text-sm leading-6 text-slate-300">Financial activity stays pending until payment confirmation, identity checks, and platform review are complete.</p></Card></div> : null}

      {step === 2 ? <Card className="p-6 sm:p-8"><div className="grid gap-6 sm:grid-cols-2">
        <Field label="Host or organization name"><input className={inputClass} value={form.organizationName} onChange={(event) => update("organizationName", event.target.value)} /></Field>
        <Field label="Event brand name"><input className={inputClass} value={form.eventBrandName} onChange={(event) => update("eventBrandName", event.target.value)} /></Field>
        <Field label="Country or location"><input className={inputClass} value={form.location} onChange={(event) => update("location", event.target.value)} /></Field>
        <Field label="Contact email"><input className={inputClass} type="email" value={form.contactEmail || user?.email || ""} onChange={(event) => update("contactEmail", event.target.value)} /></Field>
        <Field label="Public host profile URL"><input className={inputClass} value={form.publicProfileUrl} onChange={(event) => update("publicProfileUrl", event.target.value)} placeholder="https://..." /></Field>
        <MediaUploadField label="Logo or avatar" value={form.logoUrl} onChange={(url) => update("logoUrl", url)} storagePath={profileMediaPath(user?.uid ?? "pending", "avatar")} kind="image" buttonLabel="Upload logo or avatar" helperText="Upload a clear square image. The saved Storage URL is added to your host profile." />
      </div></Card> : null}

      {step === 3 ? <Card className="p-6 sm:p-8"><div className="grid gap-6 sm:grid-cols-2">
        <Field label="Host type"><select className={inputClass} value={form.hostType} onChange={(event) => update("hostType", event.target.value)}>{hostTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Typical competition size"><select className={inputClass} value={form.competitionSize} onChange={(event) => update("competitionSize", event.target.value)}><option value="under_50">Under 50</option><option value="50_200">50-200</option><option value="200_1000">200-1,000</option><option value="1000_plus">1,000+</option></select></Field>
        <Field label="Voting and judging preference"><select className={inputClass} value={form.votingPreference} onChange={(event) => update("votingPreference", event.target.value)}><option value="public">Public voting</option><option value="dorocoin">DoroCoin voting</option><option value="judge">Judge review</option><option value="hybrid">Hybrid voting + judges</option><option value="manual">Manual winner confirmation</option></select></Field>
        <Field label="Event mode"><select className={inputClass} value={form.eventMode} onChange={(event) => update("eventMode", event.target.value)}><option value="online">Online only</option><option value="physical">Physical / in-person only</option><option value="hybrid">Hybrid</option><option value="unsure">Not sure yet</option></select></Field>
      </div></Card> : null}

      {step === 4 ? <Card className="p-6 sm:p-8"><h2 className="mt-5 text-2xl font-black">How financial reviews work</h2><p className="mt-4 leading-7 text-slate-300">Challenge Suite tracks confirmed entry, vote, sponsor, and event activity. Withdrawal requests and prize releases remain subject to identity checks, eligibility review, and the applicable hold period.</p><label className="mt-7 flex items-start gap-3 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300"><input className="mt-1" type="checkbox" checked={form.revenueAcknowledged} onChange={(event) => update("revenueAcknowledged", event.target.checked)} /><span>I understand that financial activity remains subject to confirmation and platform review.</span></label></Card> : null}

      {step === 5 ? <div className="grid gap-4">
        <HostAction title="Build first competition" body="Open the Host competition builder." label="Build Competition" onChoose={() => void complete("/challenges/create")} />
        <HostAction title="Create a live event" body="Prepare a managed event from your Host workspace." label="Create Live Event" onChoose={() => void complete("/live-events")} />
        <HostAction title="Open Host Control Center" body="Review operations, participants, submissions, voting, and reports." label="Open Controls" onChoose={() => void complete("/dashboard/host")} />
      </div> : null}

      {error ? <p className="mt-5 rounded-[8px] border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</p> : null}
      {step < 5 ? <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="ghost" disabled={step === 1} onClick={() => setStep((value) => value - 1)}>Back</Button><Button onClick={() => setStep((value) => value + 1)} disabled={(step === 2 && !workspaceValid) || (step === 4 && !form.revenueAcknowledged)}>Continue</Button></div> : null}
      {step === 5 && saving ? <p className="mt-5 text-sm text-slate-400">Saving your Host workspace...</p> : null}
    </OnboardingShell>
  );
}

function HostAction({ title, body, label, onChoose }: { title: string; body: string; label: string; onChoose: () => void }) {
  return <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div><Button onClick={onChoose} className="shrink-0">{label}</Button></Card>;
}
