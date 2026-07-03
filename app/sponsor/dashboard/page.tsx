"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, Building2, CalendarClock, CreditCard, Megaphone, MessageSquare, ShieldCheck, Store, Target, Users } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { SponsorPlaceholder, SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";

interface SponsorProfile {
  brandName?: string | null;
  industry?: string | null;
  website?: string | null;
  countryLocation?: string | null;
  brandDescription?: string | null;
  businessEmail?: string | null;
  ctaButtonText?: string | null;
  ctaDestinationLink?: string | null;
  sponsorshipGoals?: string[];
  preferredChallengeCategories?: string[];
  sponsorOnboardingStatus?: string | null;
  sponsorVerificationStatus?: string | null;
  hasSponsorProfile?: boolean;
  updatedAt?: string | null;
  planId?: string | null;
  planStatus?: string | null;
}

interface SponsorProfileResponse {
  profileExists: boolean;
  sponsorProfile: SponsorProfile;
}

const commandSections = [
  { title: "Campaigns", icon: Megaphone, body: "Campaign management will live here after the sponsor campaign builder is activated." },
  { title: "Sponsor Challenges / Marketplace", icon: Store, body: "Future marketplace browsing and sponsor request workflows will appear here." },
  { title: "Create Campaign", icon: Target, body: "Campaign creation is intentionally deferred until sponsor payment and review rules are finalized." },
  { title: "Placements", icon: CalendarClock, body: "Placement inventory, CTA slots, and sponsored challenge surfaces will be managed here later." },
  { title: "Audience Insights", icon: BarChart3, body: "Audience and performance insights are placeholder-only in this shell." },
  { title: "Budget & Billing", icon: CreditCard, body: "No sponsor money release, payouts, or active billing workflows are enabled in this batch." },
  { title: "Team Members", icon: Users, body: "Team seat management is planned, but no invitations are active yet." },
  { title: "Messages", icon: MessageSquare, body: "Sponsor-to-creator messaging will be connected in a later phase." }
];

export default function SponsorDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SponsorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    const result = await apiRequest<SponsorProfileResponse>("/api/sponsor/profile");
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthorized(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Sponsor profile could not be loaded.");
      setLoading(false);
      return;
    }

    const sponsorProfile = result.data.sponsorProfile;
    if (!sponsorProfile.hasSponsorProfile || sponsorProfile.sponsorOnboardingStatus !== "complete") {
      router.replace("/sponsor/onboarding");
      return;
    }

    setProfile(sponsorProfile);
    setLoading(false);
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  const goals = useMemo(() => profile?.sponsorshipGoals ?? [], [profile]);
  const categories = useMemo(() => profile?.preferredChallengeCategories ?? [], [profile]);
  const experience = getPlanExperience({ planId: profile?.planId, planStatus: profile?.planStatus, accountType: "sponsor" });

  if (loading) {
    return (
      <SponsorShell profile={profile}>
        <div className="space-y-8">
          <div className="h-12 w-96 max-w-full animate-pulse rounded bg-white/10" />
          <div className="grid gap-6 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse bg-[#171717]" />)}</div>
          <div className="grid gap-6 xl:grid-cols-2">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-40 animate-pulse bg-[#171717]" />)}</div>
        </div>
      </SponsorShell>
    );
  }

  if (unauthorized) {
    return (
      <SponsorShell profile={profile}>
        <Card className="mx-auto mt-16 max-w-2xl p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Sponsor access required</h1>
          <p className="mt-3 text-slate-300">{error ?? "Sign in with a verified sponsor account to access the Brand Command Center."}</p>
          <LinkButton href="/auth/login" className="mt-6">Sign In</LinkButton>
        </Card>
      </SponsorShell>
    );
  }

  return (
    <SponsorShell profile={profile}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">{experience.badgeLabel} · Brand Command Center</p>
          <h1 className="mt-2 text-4xl font-black md:text-5xl">{profile?.brandName || "Sponsor Dashboard"}</h1>
          <p className="mt-3 max-w-3xl text-slate-300">A dedicated sponsor operating area for campaigns, placements, marketplace activity, audience insights, reports, team access, and billing foundations.</p>
        </div>
        <LinkButton href="/sponsor/onboarding" variant="secondary">Edit Brand Profile <ArrowRight size={17} /></LinkButton>
      </div>

      {error ? <Card className="mt-8 border-red-500/20 bg-red-950/30 p-5 text-red-200">{error}</Card> : null}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Metric title="Verification" value={(profile?.sponsorVerificationStatus || "pending_review").replaceAll("_", " ")} label="Future admin review status" />
        <Metric title="Campaign Capacity" value={experience.challengeLimitLabel} label="Plan workspace allowance" />
        <Metric title="Team Seats" value={String(experience.teamMemberLimit)} label={experience.features.team_management ? "Team foundation available" : "Team upgrades available on higher sponsor plans"} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] bg-yellow-500/10 text-[var(--gold)]"><Building2 /></div>
            <div>
              <h2 className="text-2xl font-black">Brand Profile</h2>
              <p className="mt-2 text-slate-300">{profile?.brandDescription || "Your brand description will appear here after onboarding."}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Info label="Industry" value={profile?.industry} />
            <Info label="Location" value={profile?.countryLocation} />
            <Info label="Business Email" value={profile?.businessEmail} />
            <Info label="Website" value={profile?.website} />
            <Info label="CTA" value={profile?.ctaButtonText && profile?.ctaDestinationLink ? `${profile.ctaButtonText} -> ${profile.ctaDestinationLink}` : null} />
            <Info label="Updated" value={profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : null} />
          </div>
        </Card>

        <Card className="p-6 md:p-8">
          <h2 className="text-2xl font-black">Sponsor Readiness</h2>
          <div className="mt-5 space-y-4">
            <Readiness label="Brand profile completed" done={Boolean(profile?.hasSponsorProfile)} />
            <Readiness label="Admin review status prepared" done={Boolean(profile?.sponsorVerificationStatus)} />
            <Readiness label="Sponsor goals captured" done={goals.length > 0} />
            <Readiness label="Preferred categories captured" done={categories.length > 0} />
          </div>
          <p className="mt-6 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300">Payments, sponsor money release, reports, campaign creation, and marketplace workflows are intentionally not active in this shell.</p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-4">
        {commandSections.map((section) => {
          const Icon = section.icon;
          return <SponsorPlaceholder key={section.title} title={section.title} body={section.body} />;
        })}
      </div>
    </SponsorShell>
  );
}

function Metric({ title, value, label }: { title: string; value: string; label: string }) {
  return <Card className="p-6"><p className="text-sm font-bold text-slate-400">{title}</p><p className="mt-2 text-3xl font-black capitalize text-[var(--gold-2)]">{value}</p><p className="mt-1 text-sm text-slate-300">{label}</p></Card>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-[8px] bg-[#1a1a1a] p-4"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-white">{value || "Not provided"}</p></div>;
}

function Readiness({ label, done }: { label: string; done: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-[8px] bg-[#1a1a1a] p-4"><span className="font-bold">{label}</span><span className={done ? "text-sm font-black text-emerald-300" : "text-sm font-black text-slate-500"}>{done ? "Ready" : "Pending"}</span></div>;
}
