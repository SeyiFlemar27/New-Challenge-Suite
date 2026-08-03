"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Search } from "lucide-react";
import { CampaignActionsMenu } from "@/components/sponsor/campaign-actions-menu";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, EmptyState, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { campaignStatusLabel, formatDateRange, sponsorCampaignStatuses } from "@/lib/sponsor-campaigns";

type Campaign = Record<string, any>;

export default function SponsorCampaignsPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  async function load() {
    setLoading(true);
    const [profileResult, campaignResult] = await Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ campaigns: Campaign[] }>("/api/sponsor/campaigns")]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
    if (campaignResult.ok && campaignResult.data) { setCampaigns(campaignResult.data.campaigns); setError(""); }
    else setError(campaignResult.message || "Campaigns could not be loaded.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => campaigns.filter((campaign) => (status === "all" || campaign.status === status) && (!query || [campaign.campaignTitle, campaign.objective, campaign.category].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))), [campaigns, status, query]);

  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Sponsor Campaigns</p><h1 className="mt-3 text-4xl font-black text-slate-950">Campaign briefs</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Create draft briefs, organize target audiences and deliverables, then use discovery to prepare creator and challenge opportunities. No funding or proposals are activated here.</p></div><LinkButton href="/sponsor/campaigns/new">Create Campaign Brief</LinkButton></div><Card className="mt-8 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" /></div><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{sponsorCampaignStatuses.map((item) => <option key={item} value={item}>{campaignStatusLabel(item)}</option>)}</select></div></Card>{error ? <Card className="mt-6 border border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}{loading ? <div className="mt-8 grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-60 animate-pulse bg-slate-100" />)}</div> : filtered.length === 0 ? <EmptyState icon={<Megaphone />} title="No campaign briefs yet." body="Create your first campaign brief to start finding creators and challenges for your brand." action={<LinkButton href="/sponsor/campaigns/new">Create Campaign Brief</LinkButton>} /> : <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((campaign) => <Card key={campaign.id} className="flex min-w-0 flex-col p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">{campaignStatusLabel(campaign.status)}</p><h2 className="mt-3 line-clamp-2 break-words text-2xl font-black text-slate-950">{campaign.campaignTitle}</h2></div><CampaignActionsMenu campaign={campaign} onChanged={() => void load()} /></div><p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-slate-600">{campaign.campaignDescription || "Campaign description pending."}</p><div className="mt-5 grid gap-3 text-sm text-slate-600"><Info label="Objective" value={campaign.objective} /><Info label="Budget" value={campaign.budgetSummary || `${campaign.budget?.currency ?? "USD"} ${campaign.budget?.totalBudgetCents ? campaign.budget.totalBudgetCents / 100 : 0} planned`} /><Info label="Dates" value={formatDateRange(campaign.startDate, campaign.endDate)} /><Info label="Deliverables" value={`${campaign.deliverablesCount ?? 0}`} /><Info label="Saved/Invited Creators" value={`${campaign.savedCreatorCount ?? 0}/${campaign.invitedCreatorCount ?? 0}`} /><Info label="Attached Challenges" value={`${campaign.attachedChallengeCount ?? 0}`} /></div><LinkButton href={`/sponsor/campaigns/${campaign.id}`} variant="secondary" className="mt-5 w-full">View Campaign Brief</LinkButton></Card>)}</div>}</div></SponsorShell>;
}
function Info({ label, value }: { label: string; value: any }) { return <div className="rounded-[8px] bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-slate-950">{value || "Not available yet"}</p></div>; }
