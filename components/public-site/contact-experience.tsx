"use client";

import Link from "next/link";
import { LifeBuoy, Mail, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PublicFooter, PublicHeader } from "@/components/public-site/public-shell";
import { apiRequest } from "@/lib/api/client";

const categories = [
  ["account", "Account access or verification"],
  ["challenge", "Challenge, submission, or voting issue"],
  ["payment", "Payment or subscription"],
  ["payout", "Withdrawal or payout"],
  ["sponsor", "Creator, Host, or Sponsor onboarding"],
  ["safety_concern", "Abuse, safety, or legal concern"]
] as const;

export function ContactExperience() {
  const auth = useAuth();
  const [form, setForm] = useState({ category: "account", subject: "", message: "", reference: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice("");
    setFailed(false);
  }

  function openEmailFallback() {
    const subject = encodeURIComponent(`[${categories.find(([value]) => value === form.category)?.[1] ?? "Support"}] ${form.subject || "Challenge Suite support request"}`);
    const body = encodeURIComponent(`Email: ${form.email || auth.user?.email || "Not provided"}\nReference: ${form.reference || "Not provided"}\n\n${form.message}`);
    window.location.href = `mailto:support@challengesuite.com?subject=${subject}&body=${body}`;
    setFailed(false);
    setNotice("Your email app was opened with the support request. Send the message there to contact support.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.subject.trim().length < 5 || form.message.trim().length < 20 || (!auth.user && !/^\S+@\S+\.\S+$/.test(form.email))) {
      setFailed(true);
      setNotice("Add a valid email, a clear subject, and at least 20 characters describing the issue.");
      return;
    }
    if (!auth.user) {
      openEmailFallback();
      return;
    }
    setSaving(true);
    setFailed(false);
    const result = await apiRequest<{ ticketId: string; status: string }>("/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({ category: form.category, subject: form.subject, description: form.message, relatedId: form.reference || undefined, prioritySuggestion: form.category === "safety_concern" ? "urgent" : "normal", attachmentPaths: [], contactPreference: "in_app" })
    });
    setSaving(false);
    setFailed(!result.ok);
    setNotice(result.message);
    if (result.ok) setForm((current) => ({ ...current, subject: "", message: "", reference: "" }));
  }

  return <main className="public-page"><PublicHeader />
    <section className="border-b border-[#e4e1d4] bg-[#fffdf5] py-16 sm:py-20 lg:py-24"><div className="public-container grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><div><p className="text-sm font-bold text-[#887500]">Contact and support</p><h1 className="mt-4 max-w-3xl text-[clamp(2.6rem,6vw,4.8rem)] font-semibold leading-[1.05]">How can we help?</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-[#5e5e59]">Tell us what happened and include the relevant challenge, account, or transaction reference. Signed-in users receive a trackable support ticket.</p></div><div className="rounded-[14px] border border-[#e0d79b] bg-[#f5d90a] p-7 sm:p-8"><LifeBuoy size={28}/><h2 className="mt-5 text-2xl font-semibold">Response expectations</h2><p className="mt-3 leading-7 text-black/70">Support requests are acknowledged in-app. Provider, payment, safety, and account reviews may require additional verification before resolution.</p></div></div></section>
    <section className="public-section"><div className="public-container grid gap-8 lg:grid-cols-[.72fr_1.28fr]"><aside><h2 className="text-2xl font-semibold">Choose the closest category</h2><div className="mt-6 grid gap-3">{categories.map(([, label]) => <div key={label} className="rounded-[10px] border border-[#deded8] bg-[#fafaf7] p-4 text-sm font-bold">{label}</div>)}</div><div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-5"><ShieldAlert className="text-red-700"/><h3 className="mt-3 font-semibold text-red-950">Safety guidance</h3><p className="mt-2 text-sm leading-6 text-red-900/75">Do not include passwords, full payment-card numbers, private keys, or complete bank credentials. Use the safety category for abuse or urgent platform concerns.</p></div></aside>
      <form onSubmit={submit} className="min-w-0 rounded-[14px] border border-[#deded8] bg-white p-5 shadow-[0_18px_55px_rgba(41,35,0,.07)] sm:p-8"><h2 className="text-2xl font-semibold">Send a support request</h2><div className="mt-7 grid gap-5"><label className="grid gap-2 text-sm font-bold">Category<select value={form.category} onChange={(event) => update("category", event.target.value)} className="public-input">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{!auth.user?<label className="grid gap-2 text-sm font-bold">Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="public-input" placeholder="name@example.com" /></label>:<p className="rounded-[8px] bg-[#f5f5f1] p-4 text-sm text-[#5f5f5f]">Ticket will be linked to {auth.user.email}.</p>}<label className="grid gap-2 text-sm font-bold">Subject<input value={form.subject} onChange={(event) => update("subject", event.target.value)} className="public-input" maxLength={160}/></label><label className="grid gap-2 text-sm font-bold">Message<textarea value={form.message} onChange={(event) => update("message", event.target.value)} className="public-input min-h-40 resize-y" maxLength={5000}/></label><label className="grid gap-2 text-sm font-bold">Related challenge or account reference <span className="font-normal text-[#73736d]">Optional</span><input value={form.reference} onChange={(event) => update("reference", event.target.value)} className="public-input" maxLength={160}/></label><button disabled={saving} className="public-primary-button justify-center"><Send size={17}/>{saving ? "Submitting..." : auth.user ? "Submit support ticket" : "Open email request"}</button>{notice?<p role="status" className={`rounded-[8px] p-4 text-sm ${failed ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{notice}{failed?<button type="button" onClick={openEmailFallback} className="ml-2 font-bold underline">Use email instead</button>:null}</p>:null}</div></form></div></section>
    <section className="border-y border-[#e4e1d4] bg-[#f7f6f0] py-12"><div className="public-container flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold">Other help options</h2><p className="mt-2 text-[#666]">Review platform guidance or track tickets from your account.</p></div><div className="flex flex-col gap-3 sm:flex-row"><Link href="/community-guidelines" className="public-secondary-button justify-center">Community guidelines</Link>{auth.user?<Link href="/support/tickets" className="public-secondary-button justify-center">My support tickets</Link>:<a href="mailto:support@challengesuite.com" className="public-secondary-button justify-center"><Mail size={17}/>Email support</a>}</div></div></section><PublicFooter /></main>;
}
