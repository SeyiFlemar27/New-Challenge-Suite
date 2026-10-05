"use client";

import { useEffect, useState } from "react";
import { FileText, Megaphone } from "lucide-react";
import { CampaignActionsMenu } from "@/components/sponsor/campaign-actions-menu";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { campaignStatusLabel } from "@/lib/sponsor-campaigns";

type Campaign = Record<string, unknown> & { id: string };

export default function SponsorCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    const result = await apiRequest<{ campaigns: Campaign[] }>("/api/sponsor/campaigns");
    if (result.ok && result.data) setCampaigns(result.data.campaigns);
    else setError(result.message || "Campaigns could not be loaded.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  return <SponsorShell><div className="mx-auto max-w-7xl"><header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">My Campaigns</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Campaign briefs</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Create a real campaign brief, discover compatible opportunities, and keep funding separate until the authorized sponsorship flow reaches that stage.</p></div><LinkButton href="/sponsor/campaigns/create">Create Campaign Brief</LinkButton></header>
    {error ? <Card className="mt-7 border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}
    {loading ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((value) => <Card key={value} className="h-56 animate-pulse bg-slate-100" />)}</div> : campaigns.length === 0 ? <EmptyState icon={<Megaphone />} title="No campaign briefs yet" body="Create a campaign brief to define your sponsorship goals before connecting with a creator or challenge." action={<LinkButton href="/sponsor/campaigns/create">Create Campaign Brief</LinkButton>} /> : <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => <Card key={campaign.id} className="flex flex-col p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">{campaignStatusLabel(String(campaign.status ?? "draft"))}</p><h2 className="mt-3 text-xl font-black text-slate-950">{String(campaign.campaignTitle || "Untitled campaign brief")}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{String(campaign.campaignDescription || "Campaign details are still being prepared.")}</p><dl className="mt-5 grid gap-3 text-sm"><Info label="Objective" value={String(campaign.objective || "Not set")} /><Info label="Deliverables" value={String(campaign.deliverablesCount ?? 0)} /><Info label="Budget" value={formatBudget(campaign.budget)} /></dl><div className="mt-6 flex items-center gap-3"><LinkButton href={`/sponsor/campaigns/${campaign.id}`} variant="secondary">View</LinkButton><CampaignActionsMenu campaign={campaign} onChanged={() => void load()} /></div></Card>)}</div>}
    <Card className="mt-8 border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600"><FileText className="text-amber-800" size={20} /><p className="mt-2">Historical sponsor proposals remain available in their original records. New proposal creation is retired in favor of the campaign relationship flow.</p></Card>
  </div></SponsorShell>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd className="break-words font-bold text-slate-950">{value}</dd></div>; }
function formatBudget(value: unknown) { const budget = value && typeof value === "object" ? value as Record<string, unknown> : {}; const amount = Number(budget.totalBudgetCents ?? 0); return amount > 0 ? `${String(budget.currency || "USD")} ${(amount / 100).toLocaleString()}` : "Not set"; }
