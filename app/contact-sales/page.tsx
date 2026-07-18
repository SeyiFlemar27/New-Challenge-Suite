"use client";

import { useState } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const initial = { fullName: "", workEmail: "", company: "", website: "", role: "", expectedUsage: "", teamSize: "", budgetRange: "", message: "" };
const usageOptions = ["Enterprise access application", "Live event operations", "Team workspace", "Custom competition platform", "Other"];
const budgetOptions = ["Not sure yet", "Custom scope", "Internal review needed"];

export default function ContactSalesPage() {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); setSubmitted(false); }
  async function submit() {
    setSubmitting(true);
    const result = await apiRequest("/api/enterprise-inquiries", { method: "POST", body: JSON.stringify({ ...form, useCase: form.message || form.expectedUsage }) });
    setSubmitting(false);
    setMessage(result.ok ? "Enterprise inquiry received" : result.message);
    if (result.ok) { setForm(initial); setSubmitted(true); }
  }
  return <AppShell><div className="mx-auto max-w-6xl">
    <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
      <div><PageTitle title="Contact Challenge Suite" subtitle="Tell us what your team needs. Enterprise access and business workflows are reviewed manually before activation." icon={<Building2 />} />
        <Card className="mt-8 p-5 sm:p-7 lg:p-8">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Full name"><input className={inputClass} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} /></Field>
            <Field label="Work email"><input className={inputClass} type="email" value={form.workEmail} onChange={(e) => update("workEmail", e.target.value)} /></Field>
            <Field label="Company / organization"><input className={inputClass} value={form.company} onChange={(e) => update("company", e.target.value)} /></Field>
            <Field label="Website"><input className={inputClass} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://company.com" /></Field>
            <Field label="Role / position"><input className={inputClass} value={form.role} onChange={(e) => update("role", e.target.value)} /></Field>
            <Field label="Expected usage"><select className={inputClass} value={form.expectedUsage} onChange={(e) => update("expectedUsage", e.target.value)}><option value="">Select usage</option>{usageOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Team size"><input className={inputClass} value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} placeholder="Example: 25" /></Field>
            <Field label="Budget range"><select className={inputClass} value={form.budgetRange} onChange={(e) => update("budgetRange", e.target.value)}><option value="">Select range</option>{budgetOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
          </div>
          <div className="mt-5"><Field label="Message"><textarea className={textareaClass} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Share timeline, teams, markets, or workflow needs." /></Field></div>
          {message ? <Card className={`mt-6 p-4 text-sm ${submitted ? "border-emerald-500/20 bg-emerald-950/30 text-emerald-100" : "border-red-500/20 bg-red-950/30 text-red-200"}`}>{submitted ? <><div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> Enterprise inquiry received</div><p className="mt-2 leading-6">Our team will review your request and follow up with next steps if appropriate.</p></> : message}</Card> : null}
          <Button className="mt-6" onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit Inquiry"}</Button>
        </Card>
      </div>
      <Card className="p-6 lg:sticky lg:top-24"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Manual access</p><h2 className="mt-3 text-2xl font-black">No automatic checkout</h2><p className="mt-3 text-sm leading-6 text-slate-300">Enterprise access is reviewed and approved manually. This form does not create a payment link, receipt, email confirmation, or account activation.</p></Card>
    </div>
  </div></AppShell>;
}
