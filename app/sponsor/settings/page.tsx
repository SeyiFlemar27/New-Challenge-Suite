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
  return <SponsorShell profile={profile}>{loading ? <Card className="h-80 animate-pulse bg-slate-100" /> : error ? <Card className="border-red-500/20 border border-red-200 bg-red-50 p-6 text-red-800">{error}</Card> : <div className="mx-auto max-w-6xl"><p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">Sponsor Settings</p><h1 className="mt-3 text-4xl font-black">Account and brand controls</h1><p className="mt-3 max-w-3xl text-slate-600">Manage brand profile, verification, billing, team access, notifications, security, and privacy from clear grouped sections.</p><div className="mt-8 grid gap-5 lg:grid-cols-2">{sections.map((section) => <Card key={section.title} className="p-6"><section.icon className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">{section.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p>{section.href ? <LinkButton href={section.href} variant="secondary" className="mt-5">Open</LinkButton> : null}</Card>)}</div><Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6"><ShieldCheck className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Current status</h2><p className="mt-2 text-sm text-slate-600">Plan: {profile?.planId?.replaceAll("_", " ") || "No sponsor plan"} / Subscription: {subStatus.replaceAll("_", " ")} / Verification: {businessVerificationLabel(verification)}</p></Card><Card className="mt-8 border-red-500/20 bg-red-50 p-6"><AlertTriangle className="text-red-800" /><h2 className="mt-3 text-xl font-black">Destructive actions require confirmation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Cancellation, account deletion, and destructive brand changes remain confirmation-gated. No sponsor wallet release, refund, prize release, or payout action is available here.</p></Card></div>}</SponsorShell>;
}
const sections = [
  { title: "Brand Profile", body: "Business information, brand identity, sponsorship goals, audience preferences, and public visibility.", icon: Settings, href: "/sponsor/profile/edit" },
  { title: "Verification", body: "Track review status, requested changes, and resubmission requirements.", icon: ShieldCheck, href: "/sponsor/onboarding" },
  { title: "Billing & Payment", body: "Review your current plan, payment readiness, sponsor funds, invoices, and billing history.", icon: CreditCard, href: "/sponsor/billing" },
  { title: "Team", body: "Manage team access only when the active sponsor plan supports team seats.", icon: Users, href: "/sponsor/team" },
  { title: "Notifications", body: "Choose campaign, proposal, review, billing, and support notification preferences.", icon: Bell, href: "/sponsor/notifications" },
  { title: "Security", body: "Review account protection and access controls for sensitive sponsor actions.", icon: LockKeyhole },
  { title: "Privacy", body: "Control sponsor profile and brand asset visibility without exposing private records.", icon: ShieldCheck }
];