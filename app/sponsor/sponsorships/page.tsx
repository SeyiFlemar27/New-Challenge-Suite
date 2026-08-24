"use client";

import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatMoney, label } from "@/lib/sponsor-finance";

type Sponsorship = Record<string, unknown> & { id: string };

export default function SponsorSponsorshipsPage() {
  const [items, setItems] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportingId, setReportingId] = useState("");

  useEffect(() => { void apiRequest<{ sponsorships: Sponsorship[] }>("/api/sponsor/sponsorships").then((result) => { setLoading(false); if (!result.ok) return setError(result.message); setItems(result.data?.sponsorships ?? []); }); }, []);

  async function createFinalReport(item: Sponsorship) {
    setReportingId(item.id); setError("");
    const result = await apiRequest<{ report: { id: string } }>("/api/sponsor/reports", { method: "POST", body: JSON.stringify({ sponsorshipId: item.id, title: `Final sponsorship report - ${String(item.title ?? item.proposalId ?? item.id)}`, type: "campaign_completion" }) });
    setReportingId("");
    if (!result.ok || !result.data?.report.id) return setError(result.message);
    window.location.href = `/sponsor/reports/${result.data.report.id}`;
  }

  return <SponsorShell><div className="mx-auto max-w-7xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsorships</p><h1 className="mt-2 text-4xl font-black text-slate-950">Active sponsorship workspace</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Track funded sponsorships created from mutually accepted proposal revisions.</p></div><LinkButton href="/sponsor/proposals/new">New Proposal</LinkButton></header>
    {error ? <Card className="mt-7 border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}
    {loading ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((value) => <Card key={value} className="h-56 animate-pulse bg-slate-100" />)}</div> : items.length === 0 ? <EmptyState icon={<Handshake />} title="No funded sponsorships yet" body="A sponsorship appears here after both parties accept the same proposal revision and the full amount is reserved from confirmed Sponsor Wallet funds." action={<LinkButton href="/sponsor/proposals">Review Proposals</LinkButton>} /> : <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">{label(item.status)}</p><h2 className="mt-3 text-xl font-black text-slate-950">{String(item.title ?? item.proposalId ?? "Sponsorship")}</h2><dl className="mt-5 grid gap-3 text-sm"><Info title="Reserved value" value={formatMoney(item.amountCents, item.currency)} /><Info title="Funding" value={label(item.fundingStatus)} /><Info title="Sponsor position" value={label(item.sponsorRole)} /><Info title="Accepted revision" value={String(item.acceptedRevisionId ?? "Unavailable")} /></dl><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/sponsor/sponsorships/${item.id}`}>Manage</LinkButton><LinkButton href={`/sponsor/proposals/${String(item.proposalId)}`} variant="secondary">Proposal</LinkButton><LinkButton href="/sponsor/deliverables" variant="ghost">Deliverables</LinkButton>{["completed", "completion_review"].includes(String(item.status)) ? <Button onClick={() => void createFinalReport(item)} disabled={reportingId === item.id}>{reportingId === item.id ? "Creating..." : "Final Report"}</Button> : null}</div></Card>)}</div>}
  </div></SponsorShell>;
}

function Info({ title, value }: { title: string; value: string }) { return <div><dt className="text-slate-500">{title}</dt><dd className="break-words font-bold text-slate-950">{value}</dd></div>; }
