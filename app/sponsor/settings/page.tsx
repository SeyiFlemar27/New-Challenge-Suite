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
  return <SponsorShell profile={profile}>{loading ? <Card className="h-80 animate-pulse bg-[#171717]" /> : error ? <Card className="border-red-500/20 bg-red-950/30 p-6 text-red-200">{error}</Card> : <div className="mx-auto max-w-6xl"><p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">Sponsor Settings</p><h1 className="mt-3 text-4xl font-black">Account and brand controls</h1><p className="mt-3 max-w-3xl text-slate-300">Settings are foundation-ready with clear links to brand profile, verification, team, billing, notifications, security, integrations, privacy, and account controls. Destructive actions require confirmation and server validation.</p><div className="mt-8 grid gap-5 lg:grid-cols-2">{sections.map((section) => <Card key={section.title} className="p-6"><section.icon className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">{section.title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{section.body}</p>{section.href ? <LinkButton href={section.href} variant="secondary" className="mt-5">Open</LinkButton> : null}</Card>)}</div><Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6"><ShieldCheck className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">Current status</h2><p className="mt-2 text-sm text-slate-300">Plan: {profile?.planId?.replaceAll("_", " ") || "No sponsor plan"} / Subscription: {subStatus.replaceAll("_", " ")} / Verification: {businessVerificationLabel(verification)}</p></Card><Card className="mt-8 border-red-500/20 bg-red-950/20 p-6"><AlertTriangle className="text-red-200" /><h2 className="mt-3 text-xl font-black">Destructive actions require confirmation</h2><p className="mt-2 text-sm leading-6 text-slate-300">Cancellation, account deletion, and destructive brand changes remain confirmation-gated foundations. No sponsor wallet release, refund, prize release, or payout action is available here.</p></Card></div>}</SponsorShell>;
}
const sections = [
  { title: "Brand profile", body: "Business information, identity, goals, audience, CTA preferences, and visibility.", icon: Settings, href: "/sponsor/profile/edit" },
  { title: "Business information", body: "Legal business details and operating profile are managed through onboarding and profile edit foundations.", icon: Settings, href: "/sponsor/onboarding" },
  { title: "Verification", body: "Track verification status and resubmission needs without exposing raw documents.", icon: ShieldCheck, href: "/sponsor/onboarding" },
  { title: "Team", body: "Team seats, invites, role permissions, and remove/transfer foundations.", icon: Users, href: "/sponsor/team" },
  { title: "Billing and subscription", body: "Current plan, subscription status, renewal, upgrade/downgrade, cancellation, and invoice history foundation.", icon: CreditCard, href: "/sponsor/billing" },
  { title: "Payment methods", body: "Payment method setup remains provider-backed and disabled until secure server flows exist.", icon: CreditCard, href: "/sponsor/billing" },
  { title: "Notifications", body: "Campaign, approval, report, verification, renewal, and failed-payment preferences.", icon: Bell, href: "/sponsor/notifications" },
  { title: "Security", body: "Security review, access controls, and audit foundations for sensitive sponsor actions.", icon: LockKeyhole },
  { title: "Integrations", body: "CRM, webhook, export, and enterprise integration foundations remain disabled unless configured.", icon: Settings },
  { title: "Privacy", body: "Asset visibility, sponsor profile visibility, and public/private brand preferences foundation.", icon: ShieldCheck },
  { title: "Account deletion", body: "Requires confirmation and review. It does not delete financial or audit records automatically.", icon: Trash2 }
];
