"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, CreditCard, Megaphone, PieChart, PlusCircle, Settings, Store, Target, Users } from "lucide-react";
import { SponsorFeatureGate } from "@/components/sponsor/sponsor-feature-gate";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { normalizeSponsorReviewStatus, type SponsorFeatureKey } from "@/lib/sponsor-access";

type FeatureDefinition = {
  title: string;
  feature: SponsorFeatureKey;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  description: string;
};

const features: Record<string, FeatureDefinition> = {
  campaigns: { title: "Campaigns", feature: "campaigns", icon: Megaphone, description: "Organize sponsor campaign drafts and approved challenge collaborations." },
  challenges: { title: "Sponsor Challenges", feature: "challenges", icon: Store, description: "Browse sponsor-ready challenge opportunities after sponsor approval." },
  "create-campaign": { title: "Create Campaign", feature: "create_campaign", icon: PlusCircle, description: "Campaign creation is available through the campaign brief builder." },
  "discover-creators": { title: "Discover Creators", feature: "discover", icon: Users, description: "Creator discovery has moved to /sponsor/discover/creators." },
  events: { title: "Discover Events", feature: "discover", icon: Store, description: "Event sponsorship discovery will appear here when event opportunities are connected." },
  tournaments: { title: "Discover Tournaments", feature: "discover", icon: Target, description: "Tournament sponsorship discovery will appear here when tournament opportunities are connected." },
  proposals: { title: "Proposals", feature: "proposals", icon: Megaphone, description: "Sponsorship proposals and negotiation activity will appear here." },
  approvals: { title: "Approvals", feature: "approvals", icon: Target, description: "Campaign assets, contracts, invoices, and deliverable approvals will be reviewed here." },
  deliverables: { title: "Deliverables", feature: "deliverables", icon: Target, description: "Sponsor deliverables and creator obligations will appear here as campaigns move forward." },
  contracts: { title: "Contracts", feature: "contracts", icon: CreditCard, description: "Contract review tools are available without enabling payment releases." },
  "brand-assets": { title: "Brand Assets", feature: "brand_assets", icon: Store, description: "Logo, banner, CTA, and brand asset management tools are organized here." },
  wallet: { title: "Sponsor Wallet", feature: "wallet", icon: CreditCard, description: "Sponsor budget and wallet views are read-only. No campaign funding or release is active." },
  analytics: { title: "Analytics", feature: "analytics", icon: PieChart, description: "Campaign performance analytics will appear once real campaign data exists." },
  insights: { title: "Audience Insights", feature: "insights", icon: PieChart, description: "Audience and campaign performance insights will appear here when reporting is implemented." },
  reports: { title: "Reports", feature: "reports", icon: BarChart3, description: "Campaign reporting remains read-only until reporting is connected." },
  billing: { title: "Budget & Billing", feature: "billing", icon: CreditCard, description: "Subscription billing is separate from campaign budgets. Sponsor money capture and release are not active." },
  team: { title: "Team Members", feature: "team", icon: Users, description: "Manage team access when the active sponsor plan includes team seats." },
  notifications: { title: "Notifications", feature: "notifications", icon: Settings, description: "Sponsor notification history and preferences are organized here." },
  settings: { title: "Sponsor Settings", feature: "settings", icon: Settings, description: "Manage account and brand preferences through sponsor settings." }
}

export default function SponsorFeaturePage() {
  const params = useParams<{ feature: string }>();
  const definition = features[params.feature];
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => {
      if (result.ok && result.data) setProfile(result.data.sponsorProfile);
      else setError(result.message || "Sponsor access could not be checked.");
      setLoading(false);
    });
  }, []);

  const experience = useMemo(() => getPlanExperience({
    planId: profile?.planId,
    planStatus: profile?.planStatus,
    accountType: "sponsor"
  }), [profile]);

  if (!definition) {
    return <SponsorShell profile={profile}><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><h1 className="text-3xl font-black">Sponsor page not found</h1><LinkButton href="/sponsor/dashboard" className="mt-6">Back to Overview</LinkButton></Card></SponsorShell>;
  }

  const Icon = definition.icon;
  const reviewStatus = normalizeSponsorReviewStatus(profile?.sponsorVerificationStatus);
  const teamPlanLocked = definition.feature === "team" && !experience.features.team_management;
  return (
    <SponsorShell profile={profile}>
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Brand Command Center</p>
        <div className="mt-3 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Icon size={24} /></div>
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">{definition.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">{definition.description}</p>
          </div>
        </div>
        {loading ? <Card className="mt-8 h-72 animate-pulse bg-[#171717]" /> : error ? <Card className="mt-8 border-red-500/20 bg-red-950/30 p-6 text-red-200">{error}</Card> :
          <SponsorFeatureGate feature={definition.feature} title={definition.title} currentStatus={profile?.sponsorVerificationStatus} subscriptionStatus={profile?.subscriptionStatus ?? profile?.planStatus ?? profile?.stripeStatus}>
            {teamPlanLocked ? <Card className="mt-8 border-yellow-500/30 p-8 text-center"><Users className="mx-auto text-[var(--gold)]" size={32} /><h2 className="mt-4 text-2xl font-black">Team access requires an eligible sponsor plan</h2><p className="mt-3 text-slate-300">Your sponsor approval remains active, but this plan does not include team management seats.</p><LinkButton href="/sponsor/plans" className="mt-6">View Sponsor Plans</LinkButton></Card> :
              definition.feature === "billing" ? <BillingFoundation profile={profile} /> :
              <Card className="mt-8 p-6 sm:p-8"><p className={`text-xs font-black uppercase tracking-[0.18em] ${reviewStatus === "approved" ? "text-emerald-300" : "text-[var(--gold)]"}`}>{reviewStatus === "approved" ? "Sponsor access approved" : "Available during onboarding"}</p><h2 className="mt-3 text-2xl font-black">{definition.title} workspace</h2><p className="mt-3 leading-7 text-slate-300">{reviewStatus === "approved" ? `This route is available for approved sponsors. The full ${definition.title.toLowerCase()} workflow remains a planned product phase.` : "This account and brand preference area remains available while your sponsor profile is being completed or reviewed."} No campaign funds, sponsor money, or payouts can move from this page.</p>{definition.feature === "settings" ? <LinkButton href="/settings" className="mt-6">Open Account Settings</LinkButton> : null}</Card>}
          </SponsorFeatureGate>}
      </div>
    </SponsorShell>
  );
}

function BillingFoundation({ profile }: { profile: SponsorShellProfile | null }) {
  return <div className="mt-8 grid gap-6 lg:grid-cols-2">
    <Card className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Sponsor Subscription</p><h2 className="mt-3 text-2xl font-black">{profile?.planId?.replaceAll("_", " ") || "No sponsor plan selected"}</h2><p className="mt-3 capitalize text-slate-300">Status: {String(profile?.subscriptionStatus ?? profile?.planStatus ?? "none").replaceAll("_", " ")}</p><p className="mt-4 text-sm leading-6 text-slate-400">Renewal dates and invoices appear after verified subscription events. Upgrade, downgrade, and cancellation remain handled through secure billing flows.</p><LinkButton href="/sponsor/plans" className="mt-6">View Sponsor Plans</LinkButton></Card>
    <Card className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Campaign Budget</p><h2 className="mt-3 text-2xl font-black">Campaign budget readiness</h2><div className="mt-5 grid gap-3 text-sm text-slate-300">{["Sponsorship payments", "Prize pool contributions", "Boost budget", "Pending payments", "Disputes and refund reviews"].map((item) => <div key={item} className="rounded-[8px] bg-black/30 p-4">{item}: <b>Not active</b></div>)}</div><p className="mt-5 text-sm leading-6 text-slate-400">No sponsor money capture, release, refund, payout, or withdrawal action is available.</p></Card>
  </div>;
}

