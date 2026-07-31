"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { BadgeCheck, Camera, FileBadge, LockKeyhole, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";

export type Kyc = Record<string, unknown> & {
  kycStatus?: string;
  kycRequired?: boolean;
  providerConfigured?: boolean;
  premiumAccessState?: string;
  kycFailureReason?: string | null;
  kycVerifiedAt?: string | null;
};

type StatusCopy = {
  label: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  secondary?: string;
  secondaryHref?: string;
  tone: "neutral" | "warning" | "success" | "danger";
};

export function normalizeKycStatusLabel(value?: string | null) {
  const status = String(value ?? "not_started");
  if (status === "provider_error" || status === "provider_unavailable" || status === "provider_not_configured") return "temporarily_unavailable";
  return status;
}

export function kycStatusCopy(statusValue?: string | null, required = false): StatusCopy {
  const status = normalizeKycStatusLabel(required ? statusValue : "not_required");
  const copies: Record<string, StatusCopy> = {
    not_required: { label: "Not required", title: "Verification is not required", body: "Your current plan does not require identity verification. You can continue using free/basic Challenge Suite features.", cta: "Go to Dashboard", href: "/dashboard", tone: "neutral" },
    required: { label: "Not started", title: "Verification required", body: "Complete identity verification to unlock premium-sensitive features after payment.", cta: "Start Verification", href: "/kyc/start", tone: "warning" },
    not_started: { label: "Not started", title: "Verification required", body: "Complete identity verification to unlock premium-sensitive features after payment.", cta: "Start Verification", href: "/kyc/start", tone: "warning" },
    in_progress: { label: "In progress", title: "Verification in progress", body: "You started verification but have not completed all steps yet.", cta: "Continue Verification", href: "/kyc/start", tone: "warning" },
    pending_review: { label: "Under review", title: "Verification under review", body: "Your identity check has been submitted. We'll update your account when Sumsub completes the review.", cta: "Refresh Status", href: "/kyc/status", tone: "neutral" },
    verified: { label: "Verified", title: "Identity verified", body: "Your identity has been verified. Premium-sensitive tools may now unlock where all other plan, provider, and admin requirements are met.", cta: "Return to Dashboard", href: "/dashboard", secondary: "View Earnings", secondaryHref: "/earnings", tone: "success" },
    rejected: { label: "Needs attention", title: "Verification was not approved", body: "Your verification could not be approved. Please review the safe reason below and try again.", cta: "Resubmit Verification", href: "/kyc/start", secondary: "Contact Support", secondaryHref: "/contact", tone: "danger" },
    needs_resubmission: { label: "Needs resubmission", title: "Action required", body: "Your verification needs another submission. Please complete the requested steps again.", cta: "Resubmit Verification", href: "/kyc/start", secondary: "Contact Support", secondaryHref: "/contact", tone: "danger" },
    expired: { label: "Expired", title: "Verification session expired", body: "Your secure verification session expired. Start again to continue.", cta: "Start Again", href: "/kyc/start", tone: "warning" },
    temporarily_unavailable: { label: "Temporarily unavailable", title: "Verification is temporarily unavailable", body: "We could not reach the verification provider. Please try again shortly.", cta: "Retry", href: "/kyc/start", secondary: "Contact Support", secondaryHref: "/contact", tone: "warning" }
  };
  return copies[status] ?? copies.not_started;
}

function statusClass(tone: StatusCopy["tone"]) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (tone === "danger") return "border-red-400/30 bg-red-400/10 text-red-100";
  if (tone === "warning") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  return "border-white/15 bg-white/[0.05] text-slate-100";
}

export function KycOverviewPageContent() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((result) => {
      if (result.ok) setKyc(result.data?.kyc ?? null);
      else setMessage(result.message || "Sign in to view verification status.");
    });
  }, []);
  const required = kyc?.kycRequired === true;
  const copy = kycStatusCopy(kyc?.kycStatus, required);
  const primaryLabel = copy.label === "In progress" ? "Continue Verification" : copy.label === "Under review" ? "View Verification Status" : copy.label === "Verified" ? "View Verified Status" : ["Needs attention", "Needs resubmission"].includes(copy.label) ? "Resubmit Verification" : "Start Verification";
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[8px] border border-[var(--gold)]/20 bg-[radial-gradient(circle_at_top_left,rgba(245,183,0,.16),transparent_34%),#101010] p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Identity verification</p>
              <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Verify your identity</h1>
              <p className="mt-4 text-lg leading-8 text-slate-300">Complete a secure identity check to unlock premium-sensitive Challenge Suite features.</p>
              {message ? <p className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-200">{message}</p> : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <span className={`inline-flex min-h-11 items-center justify-center rounded-[8px] border px-4 text-sm font-black ${statusClass(copy.tone)}`}>{copy.label}</span>
              <LinkButton href={copy.href}>{primaryLabel}</LinkButton>
              <LinkButton href="/kyc/status" variant="secondary">View Status</LinkButton>
            </div>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard icon={<FileBadge />} title="Government ID" body="Use a valid government-issued ID such as a passport, driver license, or national ID where supported." />
          <InfoCard icon={<Camera />} title="Face verification" body="Complete a selfie or liveness check so your identity can be matched securely." />
          <InfoCard icon={<ShieldCheck />} title="Secure review" body="Your verification is reviewed by Sumsub. Challenge Suite stores only verification status and provider metadata, not raw ID documents or face media." />
          <InfoCard icon={<Sparkles />} title="Unlock premium tools" body="Once verified, eligible premium tools such as withdrawals, real-money Prediction Arena access, and revenue-related features can be unlocked where all other requirements are met." />
        </div>

        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Your information stays protected</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {["Identity checks are handled through Sumsub.", "Challenge Suite does not store raw ID documents or selfie media.", "Verification is required only for premium-sensitive tools.", "Free/basic features remain available while review is pending."].map((item) => <p key={item} className="flex gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm font-bold text-slate-200"><BadgeCheck className="shrink-0 text-[var(--gold)]" size={18} />{item}</p>)}
          </div>
          <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-100">Verification does not automatically approve withdrawals, payouts, refunds, or Prediction Arena settlement. Those features may still require additional review.</p>
        </Card>
      </div>
    </AppShell>
  );
}

export function KycStatusPageContent() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  async function load() {
    setRefreshing(true);
    const result = await apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status");
    setRefreshing(false);
    if (result.ok) { setKyc(result.data?.kyc ?? null); setMessage(""); }
    else setMessage(result.message || "Sign in to view verification status.");
  }
  useEffect(() => { void load(); }, []);
  const required = kyc?.kycRequired === true;
  const copy = kycStatusCopy(kyc?.kycStatus, required);
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className={`inline-flex rounded-[8px] border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${statusClass(copy.tone)}`}>{copy.label}</span>
              <h1 className="mt-5 text-3xl font-black sm:text-4xl">{copy.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{copy.body}</p>
            </div>
            <ShieldCheck className="hidden h-14 w-14 text-[var(--gold)] sm:block" />
          </div>
          {kyc?.kycFailureReason ? <p className="mt-5 rounded-[8px] border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">{String(kyc.kycFailureReason)}</p> : null}
          {message ? <p className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">{message}</p> : null}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {copy.cta === "Refresh Status" ? <Button onClick={load} disabled={refreshing}><RefreshCcw size={17} /> {refreshing ? "Refreshing..." : "Refresh Status"}</Button> : <LinkButton href={copy.href}>{copy.cta}</LinkButton>}
            {copy.secondary && copy.secondaryHref ? <LinkButton href={copy.secondaryHref} variant="secondary">{copy.secondary}</LinkButton> : null}
            <LinkButton href="/dashboard" variant="ghost">Dashboard</LinkButton>
          </div>
        </Card>
        <Card className="p-5 text-sm leading-6 text-slate-400">Challenge Suite stores only Sumsub metadata such as applicant ID, status, provider state, timestamps, and safe review labels. Raw government ID images, passports, driver licenses, national IDs, face scans, and liveness media are not stored in Firebase.</Card>
      </div>
    </AppShell>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <Card className="p-5 sm:p-6"><div className="text-[var(--gold)]">{icon}</div><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-300">{body}</p></Card>;
}
