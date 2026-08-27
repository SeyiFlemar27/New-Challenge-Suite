"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleAlert, Handshake, LineChart, RefreshCw, WalletCards } from "lucide-react";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";

type RecordItem = Record<string, unknown> & { id: string };
type Attention = { id: string; title: string; context: string; reason: string; href: string; actionLabel: string; deadline: string | null };
type Opportunity = { id: string; title?: string; displayName?: string; creatorName?: string; category?: string; status?: string; href: string; imageUrl?: unknown; avatarUrl?: unknown };
type DashboardResponse = {
  sponsorProfile: SponsorShellProfile;
  metrics: { activeSponsorships: number; openProposals: number; needsAttention: number; walletBalanceCents: number };
  attention: Attention[];
  sponsorships: RecordItem[];
  recommendations: { challenges: Opportunity[]; creators: Opportunity[]; source: string };
  performance: RecordItem | null;
  performanceState: "live" | "finalized" | "not_recorded";
  widgetErrors?: Record<string, string>;
};

export default function SponsorDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opportunityTab, setOpportunityTab] = useState<"challenges" | "creators">("challenges");

  async function load() {
    setLoading(true); setError("");
    const result = await apiRequest<DashboardResponse>("/api/sponsor/dashboard");
    if (result.ok && result.data) setDashboard(result.data);
    else setError(result.message || "Sponsor Studio could not be loaded.");
    setLoading(false);
  }
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("opportunities");
    if (tab === "creators") setOpportunityTab("creators");
    void load();
  }, []);

  function selectTab(tab: "challenges" | "creators") {
    setOpportunityTab(tab);
    const url = new URL(window.location.href);
    if (tab === "challenges") url.searchParams.delete("opportunities");
    else url.searchParams.set("opportunities", tab);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  if (loading) return <SponsorShell><div className="mx-auto max-w-[1320px] space-y-7"><div className="h-28 animate-pulse rounded-[8px] bg-white" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((item) => <div key={item} className="h-28 animate-pulse rounded-[8px] bg-white" />)}</div><div className="h-72 animate-pulse rounded-[8px] bg-white" /></div></SponsorShell>;

  const metrics = dashboard?.metrics ?? { activeSponsorships: 0, openProposals: 0, needsAttention: 0, walletBalanceCents: 0 };
  const opportunities = opportunityTab === "challenges" ? dashboard?.recommendations.challenges ?? [] : dashboard?.recommendations.creators ?? [];
  const historicalOnly = dashboard?.sponsorProfile.organizationStatus === "restricted";
  return <SponsorShell profile={dashboard?.sponsorProfile}><div className="mx-auto max-w-[1320px]">
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Sponsor Studio</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Welcome back, {String(dashboard?.sponsorProfile.brandName || "Sponsor")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Manage sponsorships, proposals and brand performance.</p></div><div className="flex flex-wrap gap-3">{historicalOnly ? null : <LinkButton href="/sponsor/discover?tab=challenges">Discover Opportunities <ArrowRight size={16} /></LinkButton>}<LinkButton href="/sponsor/sponsorships" variant="secondary">View Sponsorships</LinkButton></div></header>

    {historicalOnly ? <div className="mt-6 rounded-[8px] border border-amber-200 bg-amber-50 px-5 py-4"><p className="font-black text-amber-950">Historical records only</p><p className="mt-1 text-sm leading-6 text-amber-900">This Sponsor Organization is restricted. Existing sponsorships, reports, analytics and wallet history remain available, but new proposals and funding actions are disabled.</p></div> : null}

    {error ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-red-200 bg-red-50 px-5 py-4"><p className="text-sm font-bold text-red-800">{error}</p><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Try Again</Button></div> : null}

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sponsor Studio metrics">
      <Metric title="Active Sponsorships" value={String(metrics.activeSponsorships)} detail="Active and scheduled partnerships" />
      <Metric title="Open Proposals" value={String(metrics.openProposals)} detail="Proposals still in progress" />
      <Metric title="Needs Attention" value={String(metrics.needsAttention)} detail="Actions requiring your review" />
      <Metric title="Wallet Balance" value={money(metrics.walletBalanceCents)} detail="Available Sponsor funds only" icon={<WalletCards size={18} />} />
    </section>

    <div className="mt-9 grid gap-9 xl:grid-cols-[minmax(0,1.28fr)_minmax(300px,.72fr)]">
      <section><SectionTitle title="Needs Attention" href={dashboard?.attention.length === 5 ? "/sponsor/dashboard?view=attention" : undefined} />
        {dashboard?.widgetErrors?.proposals || dashboard?.widgetErrors?.deliverables ? <WidgetError message="Some attention items could not be loaded." retry={load} /> : null}
        {!historicalOnly && dashboard?.attention.length ? <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{dashboard.attention.map((item) => <div key={item.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="font-black text-slate-950">{item.title}</p><p className="mt-1 text-sm font-bold text-amber-800">{item.context}</p><p className="mt-1 text-sm leading-6 text-slate-600">{item.reason}</p>{item.deadline ? <p className="mt-1 text-xs text-slate-500">Due {date(item.deadline)}</p> : null}</div><LinkButton href={item.href} variant="ghost">{item.actionLabel} <ArrowRight size={15} /></LinkButton></div>)}</div> : <EmptyState icon={<CircleAlert />} title="Nothing needs your attention" body="New proposal responses, funding actions and deliverable reviews will appear here." />}
      </section>

      <section><SectionTitle title="Active Sponsorships" href="/sponsor/sponsorships" />
        {dashboard?.widgetErrors?.sponsorships ? <WidgetError message="Sponsorships could not be loaded." retry={load} /> : dashboard?.sponsorships.length ? <div className="mt-3 space-y-3">{dashboard.sponsorships.map((item) => <Card key={item.id} className="p-4 shadow-none"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-950">{String(item.challengeTitle ?? item.title ?? "Sponsorship")}</p><p className="mt-1 text-xs font-bold uppercase text-amber-800">{label(item.status)}</p><p className="mt-2 text-sm text-slate-600">{label(item.sponsorRole ?? "supporting")} Sponsor</p></div><Handshake className="shrink-0 text-amber-700" size={19} /></div><Link href={"/sponsor/sponsorships/" + item.id} className="mt-4 inline-flex min-h-10 items-center text-sm font-black text-slate-950">View Sponsorship <ArrowRight className="ml-1" size={15} /></Link></Card>)}</div> : <div className="mt-3 rounded-[8px] bg-[#DCD9D2]/60 p-5"><p className="font-black text-slate-950">No active sponsorships yet.</p><p className="mt-2 text-sm leading-6 text-slate-600">Discover sponsorship-ready Challenges and Creators to start your first partnership.</p>{historicalOnly ? null : <LinkButton href="/sponsor/discover?tab=challenges" className="mt-4">Discover Opportunities</LinkButton>}</div>}
      </section>
    </div>

    {historicalOnly ? null : <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black text-slate-950">Recommended Opportunities</h2><p className="mt-1 text-sm text-slate-600">Real sponsorship-ready records from Discover.</p></div><Link href={"/sponsor/discover?tab=" + opportunityTab} className="text-sm font-black text-amber-800">Discover all</Link></div>
      <div className="mt-4 inline-flex rounded-[8px] bg-slate-100 p-1" role="tablist" aria-label="Opportunity type">{(["challenges","creators"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={opportunityTab === tab} onClick={() => selectTab(tab)} className={"min-h-10 rounded-[6px] px-5 text-sm font-black capitalize " + (opportunityTab === tab ? "bg-white text-slate-950 shadow-sm" : "text-slate-600")}>{tab}</button>)}</div>
      {dashboard?.widgetErrors?.[opportunityTab] ? <WidgetError message={opportunityTab + " could not be loaded."} retry={load} /> : opportunities.length ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{opportunities.map((item) => <Link key={item.id} href={item.href} className="min-w-0 rounded-[8px] border border-slate-200 bg-white p-5 transition hover:border-amber-400"><p className="text-xs font-black uppercase text-amber-800">{item.category || (opportunityTab === "challenges" ? "Challenge" : "Creator")}</p><h3 className="mt-2 line-clamp-2 font-black text-slate-950">{item.title || item.displayName}</h3>{item.creatorName ? <p className="mt-2 truncate text-sm text-slate-600">{item.creatorName}</p> : null}<span className="mt-5 inline-flex items-center text-sm font-black">View {opportunityTab === "challenges" ? "Opportunity" : "Creator"} <ArrowRight className="ml-1" size={15} /></span></Link>)}</div> : <div className="mt-4 rounded-[8px] border border-slate-200 bg-white p-6 text-sm text-slate-600">No matching {opportunityTab} are available right now.</div>}
    </section>}

    <section className="mt-10 border-t border-slate-200 pt-8"><SectionTitle title="Performance Snapshot" href="/sponsor/analytics" />
      <div className="mt-4 grid gap-4 sm:grid-cols-3"><Snapshot label="Valid impressions" value={metric(dashboard?.performance, "validImpressions")} /><Snapshot label="Unique CTA clicks" value={metric(dashboard?.performance, "uniqueCtaClicks")} /><Snapshot label="Participants reached" value={metric(dashboard?.performance, "participantsReached")} /></div>
      <p className="mt-3 text-xs text-slate-500">{dashboard?.performanceState === "finalized" ? "Finalized and reconciled metrics" : dashboard?.performanceState === "live" ? "Live provisional metrics" : "Performance appears after measurable sponsored placements are active."}</p>
    </section>
  </div></SponsorShell>;
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon?: React.ReactNode }) { return <Card className="min-h-28 border-slate-200 bg-[#DCD9D2]/55 p-5 shadow-none"><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-slate-600">{title}</p>{icon}</div><p className="mt-2 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>; }
function SectionTitle({ title, href }: { title: string; href?: string }) { return <div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-black text-slate-950">{title}</h2>{href ? <Link href={href} className="text-sm font-black text-amber-800">View all</Link> : null}</div>; }
function WidgetError({ message, retry }: { message: string; retry: () => Promise<void> }) { return <div className="mt-3 flex items-center justify-between gap-3 rounded-[8px] border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-900">{message}</p><button type="button" onClick={() => void retry()} className="shrink-0 text-sm font-black text-amber-900">Retry</button></div>; }
function Snapshot({ label: name, value }: { label: string; value: string }) { return <div className="rounded-[8px] border border-slate-200 bg-white p-5"><LineChart size={18} className="text-amber-700" /><p className="mt-3 text-sm text-slate-600">{name}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100); }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "date unavailable" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function label(value: unknown) { return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function metric(item: RecordItem | null | undefined, key: string) { const source = item?.metrics && typeof item.metrics === "object" ? item.metrics as Record<string, unknown> : item; const value = Number(source?.[key]); return Number.isFinite(value) ? value.toLocaleString() : "Not recorded"; }