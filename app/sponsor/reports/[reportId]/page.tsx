"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label as sponsorLabel } from "@/lib/sponsor-operations";

type Report = { id: string; title?: string; type?: string; status?: string; dataSourceLabel?: string; finalizedAt?: string; exportPdfStatus?: string; snapshot?: { funding?: { currency?: string; amountCents?: number }; placements?: string[]; deliverables?: unknown[]; performance?: unknown; results?: unknown } };

export default function SponsorReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (!params.reportId) return; void apiRequest<{ report: Report }>(`/api/sponsor/reports/${params.reportId}`).then((result) => { setLoading(false); if (!result.ok) return setError(result.message); setReport(result.data?.report ?? null); }); }, [params.reportId]);
  const snapshot = report?.snapshot ?? {};
  const funding = snapshot.funding ?? {};
  return <SponsorShell><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Final Report</p><h1 className="mt-2 text-4xl font-black text-slate-950">{report?.title || "Sponsorship report"}</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">An immutable snapshot of canonical funding, placement, deliverable, and verified performance records.</p></div><LinkButton href="/sponsor/reports" variant="secondary">Reports</LinkButton></div>{error ? <Card className="mt-6 border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}{loading ? <Card className="mt-8 h-72 animate-pulse bg-slate-100" /> : !report ? <EmptyState icon={<FileText />} title="Report not found." body="This report may not exist or may not belong to your sponsor organization." /> : <Card className="mt-8 p-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Status" value={label(report.status)} /><Metric label="Data quality" value={label(report.dataSourceLabel)} /><Metric label="Funding" value={`${String(funding.currency ?? "USD")} ${(Number(funding.amountCents ?? 0) / 100).toFixed(2)}`} /><Metric label="Finalized" value={String(report.finalizedAt ?? "Not finalized")} /></div><div className="mt-6 grid gap-4 md:grid-cols-2"><Metric label="Placements" value={Array.isArray(snapshot.placements) && snapshot.placements.length ? snapshot.placements.map(label).join(", ") : "No verified placements recorded"} /><Metric label="Deliverables" value={Array.isArray(snapshot.deliverables) ? `${snapshot.deliverables.length} recorded` : "No deliverables recorded"} /><Metric label="Performance" value={snapshot.performance ? "Verified performance snapshot included" : "No verified performance records"} /><Metric label="Results" value={snapshot.results ? "Final result snapshot included" : "No final result record"} /></div>{report.exportPdfStatus === "ready" ? <a className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[8px] bg-[var(--gold)] px-4 text-sm font-black text-black" href={`/api/sponsor/reports/${report.id}?format=pdf`}>Export PDF</a> : null}</Card>}</div></SponsorShell>;
}

function Metric({ label: title, value }: { label: string; value: string }) { return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{title}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div>; }

function label(value: unknown, _index?: number) { return sponsorLabel(value); }
