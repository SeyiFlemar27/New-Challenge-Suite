"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Building2, CalendarClock, CreditCard, Megaphone, MessageSquare, ShieldCheck, Store, Target, Users } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { SponsorPlaceholder, SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { hasActiveSponsorSubscription, normalizeSponsorReviewStatus, normalizeSponsorSubscriptionStatus, sponsorStatusLabel, type SponsorReviewStatus, type SponsorSubscriptionStatus } from "@/lib/sponsor-access";

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
  subscriptionStatus?: string | null;
  stripeStatus?: string | null;
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
  { title: "Budget & Billing", icon: CreditCard, body: "Your monthly sponsor subscription is separate from any campaign or sponsorship contribution budget. Money capture and release are not active." },
  { title: "Team Members", icon: Users, body: "Team seat management is planned, but no invitations are active yet." },
  { title: "Messages", icon: MessageSquare, body: "Sponsor-to-creator messaging will be connected in a later phase." }
];

export default function SponsorDashboardPage() {
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
    setProfile(sponsorProfile);
    setLoading(false);
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  const categories = useMemo(() => profile?.preferredChallengeCategories ?? [], [profile]);
  const experience = getPlanExperience({ planId: profile?.planId, planStatus: profile?.planStatus, accountType: "sponsor" });
  const verificationStatus = normalizeSponsorReviewStatus(profile?.sponsorVerificationStatus);
  const sponsorApproved = verificationStatus === "approved";
  const subscriptionStatus = normalizeSponsorSubscriptionStatus(profile?.subscriptionStatus ?? profile?.planStatus ?? profile?.stripeStatus);
  const subscriptionActive = hasActiveSponsorSubscription(subscriptionStatus);
  const sponsorToolsUnlocked = sponsorApproved && subscriptionActive;

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
        <LinkButton href="/sponsor/onboarding" variant="secondary">{profile?.hasSponsorProfile ? "Edit Brand Profile" : "Complete Brand Profile"} <ArrowRight size={17} /></LinkButton>
      </div>

      {error ? <Card className="mt-8 border-red-500/20 bg-red-950/30 p-5 text-red-200">{error}</Card> : null}
      {!sponsorToolsUnlocked ? <SponsorAccessNotice verificationStatus={verificationStatus} subscriptionStatus={subscriptionStatus} /> : null}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Metric title="Verification" value={sponsorStatusLabel(verificationStatus)} label={sponsorApproved ? "Sponsor tools approved" : "Approval required for locked tools"} />
        <Metric title="Subscription" value={subscriptionStatus.replaceAll("_", " ")} label={subscriptionActive ? "Subscription entitlement active" : "Sponsor plan required"} />
        <Metric title="Campaign Capacity" value={experience.challengeLimitLabel} label="Plan workspace allowance" />
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
          <h2 className="text-2xl font-black">Sponsor Onboarding Checklist</h2>
          <div className="mt-5 space-y-4">
            <Readiness label="1. Choose sponsor account type" done />
            <Readiness label="2. Complete brand profile" done={Boolean(profile?.hasSponsorProfile && profile?.ctaButtonText && profile?.ctaDestinationLink && categories.length)} />
            <Readiness label="3. Submit for platform review" done={!["not_submitted", "draft"].includes(verificationStatus)} />
            <Readiness label="4. Get brand approval" done={sponsorApproved} />
            <Readiness label="5. Choose sponsor plan" done={Boolean(profile?.planId && profile.planId !== "free")} />
            <Readiness label="6. Activate subscription" done={subscriptionActive} />
            <Readiness label="7. Sponsor challenges or create campaigns" done={sponsorToolsUnlocked} />
          </div>
          <p className="mt-6 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300">Approval grants access to sponsor workspaces only. Payments, sponsor money release, and campaign funding remain inactive.</p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-4">
        {commandSections.map((section) => {
          const Icon = section.icon;
          return <SponsorPlaceholder key={section.title} title={section.title} body={sponsorToolsUnlocked ? section.body : `${section.body} Brand approval and an active sponsor subscription are required.`} />;
        })}
      </div>
    </SponsorShell>
  );
}

function SponsorAccessNotice({ verificationStatus, subscriptionStatus }: { verificationStatus: SponsorReviewStatus; subscriptionStatus: SponsorSubscriptionStatus }) {
  const approved = verificationStatus === "approved";
  const paid = hasActiveSponsorSubscription(subscriptionStatus);
  const title = approved && !paid ? "Choose a sponsor plan" : paid && !approved ? "Brand approval still required" : verificationStatus === "suspended" ? "Sponsor access suspended" : verificationStatus === "rejected" || verificationStatus === "needs_changes" ? "Brand profile changes required" : verificationStatus === "not_submitted" || verificationStatus === "draft" ? "Complete sponsor onboarding" : "Sponsor verification pending";
  const body = approved && !paid ? "Your brand is approved. Activate a sponsor subscription to unlock full sponsor tools." : paid && !approved ? "Your sponsor plan is active, but full sponsor tools remain locked until the brand is approved." : verificationStatus === "suspended" ? "Sponsor tools are locked. Contact support for the next step." : verificationStatus === "rejected" || verificationStatus === "needs_changes" ? "Update your brand profile and submit it again before sponsor tools can be approved." : verificationStatus === "not_submitted" || verificationStatus === "draft" ? "Complete your brand profile and submit it for review before sponsor tools can unlock." : "Your brand profile is under platform review. Full sponsor tools require approval and an active sponsor subscription.";
  return <Card className="mt-8 border-yellow-500/30 bg-yellow-500/5 p-6"><ShieldCheck className="text-[var(--gold)]" /><p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{sponsorStatusLabel(verificationStatus)} / Subscription {subscriptionStatus.replaceAll("_", " ")}</p><h2 className="mt-2 text-xl font-black">{title}</h2><p className="mt-2 leading-7 text-slate-300">{body}</p><div className="mt-5 flex flex-wrap gap-3"><LinkButton href={approved && !paid ? "/sponsor/plans" : "/sponsor/onboarding"}>{approved && !paid ? "Choose Sponsor Plan" : verificationStatus === "not_submitted" || verificationStatus === "draft" ? "Complete Brand Profile" : "View Review Status"}</LinkButton><LinkButton href="/sponsor/plans" variant="secondary">View Sponsor Plans</LinkButton></div></Card>;
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
