"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Building2 } from "lucide-react";

const initial = { fullName: "", company: "", workEmail: "", phone: "", website: "", expectedMonthlyChallengeVolume: "", useCase: "", liveEventNeeds: "", sponsorBrandNeeds: "", teamSize: "", budgetRange: "", message: "" };

export default function ContactSalesPage() {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); }
  async function submit() {
    setSubmitting(true);
    const result = await apiRequest("/api/enterprise-inquiries", { method: "POST", body: JSON.stringify(form) });
    setSubmitting(false);
    setMessage(result.message);
    if (result.ok) setForm(initial);
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageTitle title="Contact Sales" subtitle="Tell us about your enterprise challenge program, live event operation, sponsor activation, or team workspace needs." icon={<Building2 />} />
        <Card className="mt-8 p-5 sm:p-7 lg:p-9">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Full name"><input className={inputClass} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} /></Field>
            <Field label="Company / organization"><input className={inputClass} value={form.company} onChange={(e) => update("company", e.target.value)} /></Field>
            <Field label="Work email"><input className={inputClass} type="email" value={form.workEmail} onChange={(e) => update("workEmail", e.target.value)} /></Field>
            <Field label="Phone (optional)"><input className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
            <Field label="Website"><input className={inputClass} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://company.com" /></Field>
            <Field label="Expected monthly challenge volume"><input className={inputClass} value={form.expectedMonthlyChallengeVolume} onChange={(e) => update("expectedMonthlyChallengeVolume", e.target.value)} /></Field>
            <Field label="Team size"><input className={inputClass} value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} /></Field>
            <Field label="Budget range"><input className={inputClass} value={form.budgetRange} onChange={(e) => update("budgetRange", e.target.value)} /></Field>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Use case"><textarea className={textareaClass} value={form.useCase} onChange={(e) => update("useCase", e.target.value)} /></Field>
            <Field label="Live event needs"><textarea className={textareaClass} value={form.liveEventNeeds} onChange={(e) => update("liveEventNeeds", e.target.value)} /></Field>
            <Field label="Sponsor / brand needs"><textarea className={textareaClass} value={form.sponsorBrandNeeds} onChange={(e) => update("sponsorBrandNeeds", e.target.value)} /></Field>
            <Field label="Message"><textarea className={textareaClass} value={form.message} onChange={(e) => update("message", e.target.value)} /></Field>
          </div>
          <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300">If email delivery is not configured, your inquiry is saved for the admin dashboard and the sales team can follow up from the stored lead.</Card>
          {message ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-100">{message}</p> : null}
          <Button className="mt-6" onClick={submit} disabled={submitting}>{submitting ? "Saving..." : "Submit Enterprise Inquiry"}</Button>
        </Card>
      </div>
    </AppShell>
  );
}
