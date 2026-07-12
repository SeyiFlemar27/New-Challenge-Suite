"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { SponsorPlaceholder, SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { businessVerificationLabel, calculateSponsorCompletion, normalizeBusinessVerificationStatus, sponsorPlanLimitLabel } from "@/lib/sponsor-foundation";
import { hasActiveSponsorSubscription, normalizeSponsorReviewStatus, normalizeSponsorSubscriptionStatus, sponsorIsApproved, sponsorStatusLabel, type SponsorReviewStatus, type SponsorSubscriptionStatus } from "@/lib/sponsor-access";

type SponsorProfile = Record<string, any>;
interface SponsorProfileResponse { profileExists: boolean; sponsorProfile: SponsorProfile; }

export default function SponsorDashboardPage() {
  const [profile, setProfile] = useState<SponsorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [approvalNoticeVisible, setApprovalNoticeVisible] = useState(false);

  async function loadProfile() {
    setLoading(true); setError(null); setUnauthorized(false);
    const result = await apiRequest<SponsorProfileResponse>("/api/sponsor/profile");
    if (!result.ok || !result.data) { const code = (result as any).code; setUnauthorized(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED"); setError(result.message || "Sponsor profile could not be loaded."); setLoading(false); return; }
    setProfile(result.data.sponsorProfile); setLoading(false);
  }

  useEffect(() => { void loadProfile(); }, []);

  const experience = getPlanExperience({ planId: profile?.planId, planStatus: profile?.planStatus, accountType: "sponsor" });
  const verificationStatus = normalizeSponsorReviewStatus(profile?.sponsorVerificationStatus);
  const businessStatus = normalizeBusinessVerificationStatus(profile?.businessVerificationStatus ?? profile?.sponsorVerificationStatus);
  const sponsorApproved = sponsorIsApproved(verificationStatus);
  const subscriptionStatus = normalizeSponsorSubscriptionStatus(profile?.subscriptionStatus ?? profile?.planStatus ?? profile?.stripeStatus);
  const subscriptionActive = hasActiveSponsorSubscription(subscriptionStatus);
  const sponsorToolsUnlocked = sponsorApproved && subscriptionActive;
  const completion = calculateSponsorCompletion(profile ?? {});
  const categories = useMemo(() => profile?.preferredChallengeCategories ?? [], [profile]);

  useEffect(() => {
    if (!profile || !sponsorApproved) return;
    const noticeKey = `sponsor_approval_seen_${profile.brandName ?? "brand"}_${profile.updatedAt ?? "latest"}`;
    if (localStorage.getItem(noticeKey)) return;
    setApprovalNoticeVisible(true);
    const timer = window.setTimeout(() => { localStorage.setItem(noticeKey, "true"); setApprovalNoticeVisible(false); }, 5000);
    return () => window.clearTimeout(timer);
  }, [profile, sponsorApproved]);

  if (loading) return <SponsorShell profile={profile}><div className="space-y-8"><div className="h-12 w-96 max-w-full animate-pulse rounded bg-white/10" /><div className="grid gap-6 md:grid-cols-4">{[0,1,2,3].map((item)=><Card key={item} className="h-32 animate-pulse bg-[#171717]" />)}</div><Card className="h-80 animate-pulse bg-[#171717]" /></div></SponsorShell>;
  if (unauthorized) return <SponsorShell profile={profile}><Card className="mx-auto mt-16 max-w-2xl p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Sponsor access required</h1><p className="mt-3 text-slate-300">{error ?? "Sign in with a verified sponsor account to access the Brand Command Center."}</p><LinkButton href="/auth/login" className="mt-6">Sign In</LinkButton></Card></SponsorShell>;

  return <SponsorShell profile={profile}>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div><p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">{experience.badgeLabel} / Brand Command Center</p><h1 className="mt-2 text-4xl font-black md:text-5xl">Welcome, {profile?.brandName || "Sponsor"}</h1><p className="mt-3 max-w-3xl text-slate-300">A complete sponsor operating center for campaigns, discovery, proposals, messages, deliverables, approvals, contracts, wallet readiness, billing, analytics, reports, assets, team, and notifications.</p></div>
      <div className="flex flex-wrap gap-3"><LinkButton href="/sponsor/campaigns/new">Create Campaign</LinkButton><LinkButton href="/sponsor/discover/creators" variant="secondary">Browse Creators</LinkButton><LinkButton href="/sponsor/discover/challenges" variant="secondary">Browse Challenges</LinkButton></div>
    </div>

    {error ? <Card className="mt-8 border-red-500/20 bg-red-950/30 p-5 text-red-200">{error}</Card> : null}
    {approvalNoticeVisible ? <Card className="mt-8 border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100"><ShieldCheck className="text-emerald-300" /><h2 className="mt-3 text-xl font-black">Sponsor profile approved</h2><p className="mt-2 text-sm leading-6">Your brand review is approved. This notice closes automatically and remains available through notification history.</p></Card> : null}
    {!sponsorToolsUnlocked ? <SponsorAccessNotice verificationStatus={verificationStatus} subscriptionStatus={subscriptionStatus} completion={completion} /> : null}

    <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <Metric title="Verification" value={businessVerificationLabel(businessStatus)} label={businessStatus === "verified" ? "Business verification complete" : "Restricted tools remain gated"} />
      <Metric title="Sponsor Plan" value={experience.badgeLabel} label={sponsorPlanLimitLabel(profile?.planId)} />
      <Metric title="Onboarding" value={`${completion}%`} label="Brand profile completion" />
      <Metric title="Pending Approvals" value="0" label="Foundation data only" />
    </div>

    <div className="mt-8 overflow-hidden rounded-[8px] border border-white/10 bg-[#111]"><div className="h-44 bg-cover bg-center" style={{ backgroundImage: profile?.bannerUrl ? `url(${profile.bannerUrl})` : "linear-gradient(135deg, rgba(245,197,66,.18), rgba(255,255,255,.04))" }} /><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"><div className="flex items-end gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--gold)]/40 bg-black text-2xl font-black text-[var(--gold)]">{profile?.logoUrl ? <img src={profile.logoUrl} alt={profile?.brandName || "Sponsor logo"} className="h-full w-full object-cover" /> : (profile?.brandName || "S").slice(0, 1)}</div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Brand identity</p><h2 className="mt-1 text-2xl font-black">{profile?.brandName || "Sponsor Brand"}</h2><p className="mt-1 text-sm text-slate-400">{profile?.industry || "Industry pending"} / {profile?.website || "Website pending"}</p></div></div><LinkButton href="/sponsor/profile/edit" variant="secondary">Edit Brand Profile</LinkButton></div></div>

    <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_.9fr]"><Card className="p-6 md:p-8"><h2 className="text-2xl font-black">Campaign Performance Foundation</h2><p className="mt-2 text-sm leading-6 text-slate-400">Real analytics appear after campaigns are created and verified. No fake metrics are displayed as live data.</p><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{["Impressions", "Clicks", "Participants", "Votes", "Engagement rate", "Cost per participant", "Cost per click", "Conversions"].map((item) => <Info key={item} label={item} value="No data yet" />)}</div></Card><Card className="p-6 md:p-8"><h2 className="text-2xl font-black">Action Center</h2><div className="mt-5 space-y-3">{actionItems(verificationStatus, subscriptionStatus, completion).map((item) => <div key={item} className="flex items-start gap-3 rounded-[8px] bg-[#1a1a1a] p-4 text-sm text-slate-300"><ShieldAlert size={17} className="mt-0.5 text-[var(--gold)]" />{item}</div>)}</div></Card></div>

    <div className="mt-8 grid gap-8 xl:grid-cols-3"><Card className="p-6 md:p-8 xl:col-span-2"><h2 className="text-2xl font-black">Active Campaigns</h2><div className="mt-6 rounded-[8px] border border-dashed border-white/15 p-8 text-center"><Megaphone className="mx-auto text-[var(--gold)]" /><h3 className="mt-4 text-xl font-black">No campaigns yet</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Create your first campaign brief or discover available challenges. Campaign funding, releases, and sponsor wallet movement are not active in this phase.</p><div className="mt-5 flex flex-wrap justify-center gap-3"><LinkButton href="/sponsor/campaigns/new">Create Campaign Brief</LinkButton><LinkButton href="/sponsor/discover/challenges" variant="secondary">Discover Challenges</LinkButton></div></div></Card><Card className="p-6 md:p-8"><h2 className="text-2xl font-black">Upcoming Calendar</h2><div className="mt-5 space-y-3 text-sm text-slate-300">{["Campaign launch dates", "Voting dates", "Submission deadlines", "Approval deadlines", "Payment milestones", "Winner announcement dates"].map((item) => <p key={item} className="rounded-[8px] bg-[#1a1a1a] p-3">{item}: No data yet</p>)}</div></Card></div>

    <div className="mt-8 grid gap-6 xl:grid-cols-4">{commandSections.map((section) => <SponsorPlaceholder key={section.title} title={section.title} body={sponsorToolsUnlocked ? section.body : `${section.body} Brand approval and an active sponsor subscription are required for full access.`} />)}</div>
  </SponsorShell>;
}

const commandSections = [
  { title: "Campaigns", body: "Campaign briefs, proposals, deliverables, and safe next milestones are connected as foundation workflows." },
  { title: "Discover", body: "Creator, challenge, event, and tournament discovery foundations are ready for later phases." },
  { title: "Collaboration", body: "Proposals, messages, approvals, and deliverables stay organized without activating contracts or funding automatically." },
  { title: "Legal", body: "Contracts and templates provide operational foundations only; no fake e-signature or binding workflow is active." },
  { title: "Finance", body: "Wallet, billing, invoices, milestones, and transactions are visible as foundation records only." },
  { title: "Growth", body: "Analytics and reports are ready with clear data-quality labels and no fake performance metrics." },
  { title: "Brand Operations", body: "Brand assets, team roles, notification preferences, settings, and audit foundations are connected." }
];

function SponsorAccessNotice({ verificationStatus, subscriptionStatus, completion }: { verificationStatus: SponsorReviewStatus; subscriptionStatus: SponsorSubscriptionStatus; completion: number }) {
  const approved = sponsorIsApproved(verificationStatus); const paid = hasActiveSponsorSubscription(subscriptionStatus);
  const title = approved && !paid ? "Choose a sponsor plan" : paid && !approved ? "Brand approval still required" : verificationStatus === "suspended" || verificationStatus === "flagged" ? "Sponsor access restricted" : verificationStatus === "rejected" || verificationStatus === "needs_changes" || verificationStatus === "additional_information_required" ? "Brand profile changes required" : completion < 80 ? "Complete sponsor onboarding" : "Sponsor verification pending";
  return <Card className="mt-8 border-yellow-500/30 bg-yellow-500/5 p-6"><ShieldCheck className="text-[var(--gold)]" /><p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{sponsorStatusLabel(verificationStatus)} / Subscription {subscriptionStatus.replaceAll("_", " ")}</p><h2 className="mt-2 text-xl font-black">{title}</h2><p className="mt-2 leading-7 text-slate-300">Sponsors can explore the dashboard while pending. Funding campaigns, verified badges, high-value sponsorship tools, payment release actions, and enterprise tools remain restricted until review, plan, and safety checks pass.</p><div className="mt-5 flex flex-wrap gap-3"><LinkButton href={approved && !paid ? "/sponsor/plans" : "/sponsor/onboarding"}>{approved && !paid ? "Choose Sponsor Plan" : "Continue Onboarding"}</LinkButton><LinkButton href="/sponsor/plans" variant="secondary">View Sponsor Plans</LinkButton></div></Card>;
}
function actionItems(status: SponsorReviewStatus, subscription: SponsorSubscriptionStatus, completion: number) { const items = []; if (completion < 100) items.push("Complete remaining onboarding fields."); if (!sponsorIsApproved(status)) items.push("Business verification is not fully approved yet."); if (!hasActiveSponsorSubscription(subscription)) items.push("Choose or activate a sponsor plan."); items.push("Review proposals, messages, deliverables, and approval queues from the sponsor collaboration workspace."); items.push("Review contracts, billing, invoices, wallet readiness, and milestone foundations before campaign funding."); items.push("Campaign funding and payment release stay disabled until provider-backed server flows are configured."); items.push("Analytics, reports, assets, team, and notification preferences are ready as foundation workspaces."); return items; }
function Metric({ title, value, label }: { title: string; value: string; label: string }) { return <Card className="p-6"><p className="text-sm font-bold text-slate-400">{title}</p><p className="mt-2 text-2xl font-black capitalize text-[var(--gold-2)]">{value}</p><p className="mt-1 text-sm text-slate-300">{label}</p></Card>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <div className="rounded-[8px] bg-[#1a1a1a] p-4"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-white">{value || "Not provided"}</p></div>; }
