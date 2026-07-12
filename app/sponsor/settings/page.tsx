"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bell, CreditCard, LockKeyhole, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { businessVerificationLabel, normalizeBusinessVerificationStatus } from "@/lib/sponsor-foundation";
import { normalizeSponsorSubscriptionStatus } from "@/lib/sponsor-access";

type SponsorProfile = Record<string, any>;

export default function SponsorSettingsPage() {
  const [profile, setProfile] = useState<SponsorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<{ sponsorProfile: SponsorProfile; settings: Record<string, any> }>("/api/sponsor/settings").then((result) => { if (result.ok && result.data) setProfile(result.data.sponsorProfile); else setError(result.message || "Sponsor settings could not be loaded."); setLoading(false); }); }, []);
  const subStatus = normalizeSponsorSubscriptionStatus(profile?.subscriptionStatus ?? profile?.planStatus ?? profile?.stripeStatus);
  const verification = normalizeBusinessVerificationStatus(profile?.businessVerificationStatus ?? profile?.sponsorVerificationStatus);
  return <SponsorShell profile={profile}>{loading ? <Card className="h-80 animate-pulse bg-[#171717]" /> : error ? <Card className="border-red-500/20 bg-red-950/30 p-6 text-red-200">{error}</Card> : <div className="mx-auto max-w-6xl"><p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">Sponsor Settings</p><h1 className="mt-3 text-4xl font-black">Account and brand controls</h1><p className="mt-3 max-w-3xl text-slate-300">Settings are foundation-ready. Destructive changes require confirmation, and billing actions remain safely separated from campaign budgets.</p><div className="mt-8 grid gap-5 lg:grid-cols-2">{sections.map((section) => <Card key={section.title} className="p-6"><section.icon className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">{section.title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{section.body}</p>{section.href ? <LinkButton href={section.href} variant="secondary" className="mt-5">Open</LinkButton> : null}</Card>)}</div><Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6"><ShieldCheck className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Current status</h2><p className="mt-2 text-sm text-slate-300">Plan: {profile?.planId?.replaceAll("_", " ") || "No sponsor plan"} / Subscription: {subStatus.replaceAll("_", " ")} / Verification: {businessVerificationLabel(verification)}</p></Card><Card className="mt-8 border-red-500/20 bg-red-950/20 p-6"><AlertTriangle className="text-red-200" /><h2 className="mt-3 text-xl font-black">Destructive actions require confirmation</h2><p className="mt-2 text-sm leading-6 text-slate-300">Cancellation, account deletion, and destructive brand changes remain confirmation-gated foundations. No sponsor wallet release, refund, prize release, or payout action is available here.</p></Card></div>}</SponsorShell>;
}
const sections = [
  { title: "Brand profile", body: "Business information, identity, goals, audience, CTA preferences, and visibility.", icon: Settings, href: "/sponsor/profile/edit" },
  { title: "Business verification", body: "Track verification status and resubmission needs without exposing raw documents.", icon: ShieldCheck, href: "/sponsor/onboarding" },
  { title: "Team foundation", body: "Team seats, roles, and permissions are prepared for later phases.", icon: Users },
  { title: "Billing and subscription", body: "Current plan, subscription status, renewal, upgrade/downgrade, cancellation, and invoice history foundation.", icon: CreditCard, href: "/sponsor/plans" },
  { title: "Notifications", body: "Campaign, approval, report, and verification notification preferences foundation.", icon: Bell, href: "/sponsor/notifications" },
  { title: "Security and privacy", body: "Security, integrations, privacy, and account deletion foundations.", icon: LockKeyhole },
  { title: "Account deletion", body: "Requires confirmation and review. It does not delete financial or audit records automatically.", icon: Trash2 }
];