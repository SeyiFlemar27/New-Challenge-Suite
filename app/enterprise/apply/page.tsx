"use client";

import { useState } from "react";
import { Building2, CheckCircle2, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const initial = { fullName: "", workEmail: "", organization: "", role: "", reason: "", expectedUse: "", teamSize: "", relationship: "", message: "" };
const useOptions = ["Challenge operations", "Private competitions", "Live events", "Tournaments", "Voting control", "Platform workflow management", "Other"];
const teamSizes = ["1-5", "6-15", "16-50", "51-100", "100+"];

export default function EnterpriseApplyPage() {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); setSubmitted(false); }
  async function submit() {
    setSubmitting(true);
    const result = await apiRequest("/api/enterprise-inquiries", { method: "POST", body: JSON.stringify({ ...form, company: form.organization, useCase: form.reason, applicationType: "enterprise_access_application" }) });
    setSubmitting(false);
    if (!result.ok) { setMessage(result.message || "Application could not be submitted."); return; }
    setSubmitted(true);
    setMessage("Enterprise application submitted");
    setForm(initial);
  }
  return <AppShell><div className="mx-auto max-w-6xl">
    <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
      <div>
        <PageTitle title="Apply for Enterprise Access" subtitle="Enterprise is reviewed manually for approved in-house operators and teams." icon={<Building2 className="text-[var(--gold)]" />} />
        <Card className="mt-8 p-5 sm:p-7 lg:p-8">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Full name"><input className={inputClass} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></Field>
            <Field label="Work email"><input className={inputClass} type="email" value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} /></Field>
            <Field label="Organization / team name"><input className={inputClass} value={form.organization} onChange={(event) => update("organization", event.target.value)} /></Field>
            <Field label="Role / position"><input className={inputClass} value={form.role} onChange={(event) => update("role", event.target.value)} /></Field>
            <Field label="Expected use"><select className={inputClass} value={form.expectedUse} onChange={(event) => update("expectedUse", event.target.value)}><option value="">Select use</option>{useOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Team size"><select className={inputClass} value={form.teamSize} onChange={(event) => update("teamSize", event.target.value)}><option value="">Select team size</option>{teamSizes.map((item) => <option key={item}>{item}</option>)}</select></Field>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Reason for requesting Enterprise access"><textarea className={textareaClass} value={form.reason} onChange={(event) => update("reason", event.target.value)} /></Field>
            <Field label="Relationship to Challenge Suite / client"><textarea className={textareaClass} value={form.relationship} onChange={(event) => update("relationship", event.target.value)} /></Field>
          </div>
          <div className="mt-5"><Field label="Message / notes"><textarea className={textareaClass} value={form.message} onChange={(event) => update("message", event.target.value)} /></Field></div>
          {message ? <Card className={`mt-6 p-4 text-sm ${submitted ? "border-emerald-500/20 bg-emerald-950/30 text-emerald-100" : "border-red-500/20 bg-red-950/30 text-red-200"}`}>{submitted ? <><div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> Enterprise application submitted</div><p className="mt-2 leading-6">Your request has been received for review. Enterprise access is approved manually by the Challenge Suite team.</p><div className="mt-4 flex flex-wrap gap-3"><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/enterprise">Enterprise Panel</LinkButton></div></> : message}</Card> : null}
          <Button className="mt-6" onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit Application"}</Button>
        </Card>
      </div>
      <Card className="p-6 lg:sticky lg:top-24"><ClipboardCheck className="text-[var(--gold)]" /><p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Manual review</p><h2 className="mt-3 text-2xl font-black">Enterprise is not self-serve</h2><div className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><p>Submitting an application does not guarantee approval.</p><p>The admin/client admits approved users.</p><p>Approved users get access to an Enterprise control panel.</p><p>No payment, receipt, email, or approval is created by this form alone.</p></div></Card>
    </div>
  </div></AppShell>;
}
