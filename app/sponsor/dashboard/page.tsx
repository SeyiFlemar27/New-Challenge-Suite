"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Handshake, Megaphone, MessageSquare, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";

type Item = Record<string, any>;
type DashboardResponse = {
  sponsorProfile: Item;
  campaigns: Item[];
  proposals: Item[];
  fundedChallenges: Item[];
  metrics: Record<string, number | null>;
  workspaceSignals?: { hasConversations: boolean; conversationCount: number; unreadMessageCount: number; hasReportableData: boolean };
};

export default function SponsorDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const result = await apiRequest<DashboardResponse>("/api/sponsor/dashboard");
    if (result.ok && result.data) setDashboard(result.data);
    else setError(result.message || "Sponsor workspace could not be loaded.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const profile = useMemo<Item | null>(() => dashboard ? ({ ...dashboard.sponsorProfile, hasSponsorConversations: dashboard.workspaceSignals?.hasConversations, sponsorConversationCount: dashboard.workspaceSignals?.conversationCount, hasSponsorReportableData: dashboard.workspaceSignals?.hasReportableData }) : null, [dashboard]);
  const workspace = resolveSponsorWorkspaceState(profile ?? {});
  const experience = getPlanExperience({ planId: profile?.planId, planStatus: profile?.planStatus, accountType: "sponsor" });
  const activeCampaigns = dashboard?.campaigns.filter((item) => ["approved", "matching", "proposal_sent", "negotiating", "accepted", "funding_required", "funded", "live", "active"].includes(String(item.status ?? "").toLowerCase())) ?? [];
  const openProposals = dashboard?.proposals.filter((item) => !["declined", "completed", "cancelled", "archived"].includes(String(item.status ?? "").toLowerCase())) ?? [];
  const deadlines = (dashboard?.campaigns ?? []).flatMap((campaign) => [campaign.startDate ? { label: `${campaign.campaignTitle || "Campaign"} starts`, value: campaign.startDate } : null, campaign.endDate ? { label: `${campaign.campaignTitle || "Campaign"} ends`, value: campaign.endDate } : null]).filter(Boolean).slice(0, 4) as Array<{ label: string; value: string }>;

  if (loading) return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl space-y-6"><div className="h-28 animate-pulse rounded-[8px] bg-white" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((item) => <Card key={item} className="h-28 animate-pulse" />)}</div><Card className="h-72 animate-pulse" /></div></SponsorShell>;

  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl">
    <section className="rounded-[8px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsor Workspace</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Welcome, {profile?.brandName || "Sponsor"}</h1><div className="mt-4 flex flex-wrap gap-2 text-sm"><Status label={workspace.statusLabel} tone={workspace.approved ? "success" : "pending"} /><Status label={experience.badgeLabel} tone="brand" /><Status label={workspace.subscriptionStatus.replaceAll("_", " ")} tone={workspace.subscriptionStatus === "active" ? "success" : "neutral"} /></div><p className="mt-5 max-w-2xl text-base leading-7 text-slate-600"><strong className="text-slate-950">Next step:</strong> {workspace.nextActionLabel}. {workspace.lockedReason || "Your sponsor workspace is ready for campaign planning and discovery."}</p></div><div className="flex flex-wrap gap-3"><LinkButton href={workspace.nextActionHref}>{workspace.nextActionLabel}<ArrowRight size={16} /></LinkButton>{workspace.canDiscover ? <><LinkButton href="/sponsor/discover?tab=creators" variant="secondary">Discover Creators</LinkButton><LinkButton href="/sponsor/discover?tab=challenges" variant="secondary">Discover Challenges</LinkButton></> : <LinkButton href="/sponsor/onboarding" variant="secondary">Review Brand Profile</LinkButton>}</div></div></section>

    {error ? <Card className="mt-6 border-red-200 bg-red-50 p-5"><p className="font-bold text-red-800">Sponsor overview is temporarily unavailable.</p><p className="mt-2 text-sm text-red-700">{error}</p><Button className="mt-4" variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Retry overview</Button></Card> : null}

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sponsor overview metrics"><Metric icon={<Megaphone />} title="Active Campaigns" value={String(activeCampaigns.length)} detail="Campaigns currently moving through the pipeline" /><Metric icon={<Handshake />} title="Open Proposals" value={String(openProposals.length)} detail="Proposals that still have a next action" /><Metric icon={<MessageSquare />} title="Unread Messages" value={String(dashboard?.workspaceSignals?.unreadMessageCount ?? 0)} detail="Owned sponsor conversations only" /><Metric icon={<WalletCards />} title="Available Sponsor Funds" value={formatMoney(dashboard?.metrics.confirmedSponsorFundsCents)} detail="Provider-confirmed sponsor funding records" /></section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]"><div className="space-y-6"><Card className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Campaign pipeline</p><h2 className="mt-2 text-2xl font-black text-slate-950">Recent campaign briefs</h2></div>{workspace.canCreateCampaignBrief ? <LinkButton href="/sponsor/campaigns/new" variant="secondary">Create Brief</LinkButton> : null}</div>{dashboard?.campaigns.length ? <div className="mt-5 divide-y divide-slate-200">{dashboard.campaigns.slice(0, 5).map((campaign) => <div key={campaign.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-black text-slate-950">{campaign.campaignTitle || "Untitled campaign"}</p><p className="mt-1 text-sm text-slate-600">{label(campaign.status)} / Updated {formatDate(campaign.updatedAt)}</p></div><LinkButton href={`/sponsor/campaigns/${campaign.id}`} variant="ghost">View</LinkButton></div>)}</div> : <EmptyState icon={<Megaphone />} title="No active campaigns yet" body="Create your first campaign brief to start finding creators and challenge opportunities." action={workspace.canCreateCampaignBrief ? <LinkButton href="/sponsor/campaigns/new">Create Campaign Brief</LinkButton> : <LinkButton href={workspace.nextActionHref}>Complete Required Step</LinkButton>} />}</Card>

      <div className="grid gap-6 md:grid-cols-2"><Card className="p-6"><h2 className="text-xl font-black text-slate-950">Recommended creators</h2><p className="mt-2 text-sm leading-6 text-slate-600">Browse real sponsor-ready creator profiles matched through the discovery workspace.</p><LinkButton href={workspace.canDiscover ? "/sponsor/discover?tab=creators" : workspace.nextActionHref} variant="secondary" className="mt-5">{workspace.canDiscover ? "Discover Creators" : "Unlock Discovery"}</LinkButton></Card><Card className="p-6"><h2 className="text-xl font-black text-slate-950">Recommended challenges</h2><p className="mt-2 text-sm leading-6 text-slate-600">Review published sponsor-ready challenges and their real funding eligibility.</p><LinkButton href={workspace.canDiscover ? "/sponsor/discover?tab=challenges" : workspace.nextActionHref} variant="secondary" className="mt-5">{workspace.canDiscover ? "Discover Challenges" : "Unlock Discovery"}</LinkButton></Card></div>
    </div><aside className="space-y-6"><Card className="p-6"><ShieldCheck className="text-amber-700" /><h2 className="mt-3 text-xl font-black text-slate-950">Next steps</h2><ol className="mt-4 space-y-3 text-sm text-slate-600"><Step done={workspace.profileReady}>Complete brand profile</Step><Step done={workspace.approved}>Receive sponsor approval</Step><Step done={workspace.canCreateCampaignBrief}>Create a campaign brief</Step><Step done={openProposals.length > 0}>Open a proposal conversation</Step><Step done={Boolean(dashboard?.metrics.confirmedSponsorFundsCents)}>Confirm eligible campaign funding</Step></ol></Card><Card className="p-6"><CalendarClock className="text-amber-700" /><h2 className="mt-3 text-xl font-black text-slate-950">Upcoming deadlines</h2>{deadlines.length ? <div className="mt-4 space-y-3">{deadlines.map((item) => <div key={`${item.label}-${item.value}`} className="rounded-[8px] bg-slate-50 p-3"><p className="text-sm font-bold text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-600">{formatDate(item.value)}</p></div>)}</div> : <p className="mt-4 text-sm leading-6 text-slate-600">No campaign deadlines yet. Dates will appear after a campaign brief is saved.</p>}</Card><Card className="p-6"><h2 className="text-xl font-black text-slate-950">Sponsor status</h2><dl className="mt-4 space-y-3 text-sm"><Row label="Brand profile" value={`${workspace.completionPercent}% complete`} /><Row label="Verification" value={workspace.statusLabel} /><Row label="Plan" value={experience.badgeLabel} /><Row label="Payment readiness" value={workspace.canFund ? "Eligible when proposal terms allow" : "Locked until requirements are met"} /></dl></Card></aside></div>
  </div></SponsorShell>;
}

function Metric({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) { return <Card className="p-5"><div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-amber-50 text-amber-800">{icon}</div><p className="mt-4 text-sm font-bold text-slate-600">{title}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Card>; }
function Status({ label: text, tone }: { label: string; tone: "success" | "pending" | "brand" | "neutral" }) { const styles = tone === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : tone === "pending" ? "bg-amber-50 text-amber-800 border-amber-200" : tone === "brand" ? "bg-yellow-50 text-yellow-900 border-yellow-200" : "bg-slate-50 text-slate-700 border-slate-200"; return <span className={`rounded-full border px-3 py-1 font-bold capitalize ${styles}`}>{text}</span>; }
function Step({ done, children }: { done: boolean; children: React.ReactNode }) { return <li className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{done ? "OK" : ""}</span><span>{children}</span></li>; }
function Row({ label: name, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><dt className="text-slate-500">{name}</dt><dd className="text-right font-bold text-slate-900">{value}</dd></div>; }
function label(value: unknown) { return String(value || "Draft").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatMoney(value: unknown) { return typeof value === "number" && value > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100) : "No confirmed funds"; }
function formatDate(value: unknown) { const date = new Date(String(value || "")); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "Date pending"; }