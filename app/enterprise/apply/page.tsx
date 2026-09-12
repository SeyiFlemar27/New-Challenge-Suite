"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Building2, CheckCircle2, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

const initial = { fullName: "", workEmail: "", organization: "", role: "", reason: "", expectedUse: "", teamSize: "", relationship: "", message: "" };
const useOptions = ["Challenge operations", "Private competitions", "Live events", "Tournaments", "Voting control", "Platform workflow management", "Other"];
const teamSizes = ["1-5", "6-15", "16-50", "51-100", "100+"];

export default function EnterpriseApplyPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const enterpriseApproved = Boolean(user?.availableWorkspaces?.includes("enterprise"));
  const pathname = usePathname();
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [editId, setEditId] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [editingAllowed, setEditingAllowed] = useState(true);
  useEffect(() => { if (enterpriseApproved) router.replace("/enterprise"); }, [enterpriseApproved, router]);
  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("application");
    const editingLatest = pathname === "/enterprise/application/edit";
    if (!requestedId && !editingLatest) return;
    void apiRequest<{ application: Record<string, unknown> | null; canEdit?: boolean; canResubmit?: boolean }>("/api/enterprise-inquiries").then((result) => {
      const application = result.data?.application;
      if (!result.ok || !application || (requestedId && String(application.id) !== requestedId) || !["pending", "in_review", "needs_info", "requested_changes", "rejected", "withdrawn"].includes(String(application.status ?? ""))) return;
      const allowed = Boolean(result.data?.canEdit || result.data?.canResubmit);
      setEditingAllowed(allowed);
      if (!allowed) {
        setMessage("This application cannot be edited or resubmitted right now.");
        return;
      }
      setEditId(String(application.id));
      setExpectedVersion(Number(application.version ?? application.currentRevision ?? 1));
      setApplicationStatus(String(application.status ?? "pending"));
      setForm({
        fullName: String(application.fullName ?? ""), workEmail: String(application.workEmail ?? ""), organization: String(application.company ?? ""), role: String(application.role ?? ""), reason: String(application.reason ?? application.useCase ?? ""), expectedUse: String(application.expectedUsage ?? ""), teamSize: String(application.teamSize ?? ""), relationship: String(application.relationship ?? ""), message: String(application.message ?? "")
      });
    });
  }, [pathname]);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); setSubmitted(false); }
  async function submit() {
    if (!editingAllowed) return;
    setSubmitting(true);
    const result = await apiRequest<{ application?: Record<string, unknown> }>("/api/enterprise-inquiries", { method: editId ? "PATCH" : "POST", body: JSON.stringify({ ...form, id: editId || undefined, expectedVersion: expectedVersion || undefined, company: form.organization, useCase: form.reason, applicationType: "enterprise_access_application" }) });
    setSubmitting(false);
    if (!result.ok) { setMessage(result.message || "Application could not be submitted."); return; }
    setSubmitted(true);
    setExpectedVersion(Number(result.data?.application?.version ?? result.data?.application?.currentRevision ?? expectedVersion));
    setMessage("Enterprise application submitted");
    setForm(initial);
    router.push("/enterprise/status");
  }
  if (loading || enterpriseApproved) return <AppShell><Card className="mx-auto h-64 max-w-4xl animate-pulse" /></AppShell>;
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
          {message ? <Card className={`mt-6 p-4 text-sm ${submitted ? "border-emerald-500/20 bg-emerald-950/30 text-emerald-100" : "border-red-500/20 bg-red-950/30 text-red-200"}`}>{submitted ? <><div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> Enterprise application submitted</div><p className="mt-2 leading-6">We'll notify you when it has been reviewed.</p><div className="mt-4 flex flex-wrap gap-3"><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/enterprise/status">View Application</LinkButton><LinkButton href="/contact" variant="secondary">Contact Support</LinkButton></div></> : message}</Card> : null}
          <Button className="mt-6" onClick={submit} disabled={submitting}>{submitting ? "Saving..." : editId && ["needs_info", "requested_changes", "rejected", "withdrawn"].includes(applicationStatus) ? "Resubmit Application" : editId ? "Save Application" : "Submit Application"}</Button>
        </Card>
      </div>
      <Card className="p-6 lg:sticky lg:top-24"><ClipboardCheck className="text-[var(--gold)]" /><p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Manual review</p><h2 className="mt-3 text-2xl font-black">Enterprise is reviewed by our team</h2><div className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><p>Submitting an application does not guarantee approval.</p><p>You can keep using your normal account during review.</p><p>Approved users can switch into the Enterprise workspace.</p></div></Card>
    </div>
  </div></AppShell>;
}
