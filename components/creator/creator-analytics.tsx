"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

type Item = Record<string, unknown> & { id: string };
type CreatorData = { challenges: Item[]; participants: Item[]; submissions: Item[]; votes: Item[]; sponsorInterest: Item[] };

function itemDate(item: Item) {
  const raw = item.createdAt ?? item.submittedAt ?? item.updatedAt ?? item.paidAt;
  const date = raw ? new Date(String(raw)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function CreatorAnalytics({ data }: { data: CreatorData }) {
  const [range, setRange] = useState("90");
  const [challengeId, setChallengeId] = useState("all");
  const [status, setStatus] = useState("all");
  const challenges = data.challenges.filter((item) => (challengeId === "all" || item.id === challengeId) && (status === "all" || String(item.status ?? item.lifecycleStatus ?? "draft") === status));
  const challengeIds = new Set(challenges.map((item) => item.id));
  const cutoff = range === "all" ? null : new Date(Date.now() - Number(range) * 86_400_000);
  const select = (items: Item[]) => items.filter((item) => challengeIds.has(String(item.challengeId)) && (!cutoff || !itemDate(item) || itemDate(item)! >= cutoff));
  const participants = select(data.participants);
  const submissions = select(data.submissions);
  const votes = select(data.votes);
  const sponsorInterest = select(data.sponsorInterest);
  const rows = challenges.slice(0, 8).map((challenge) => ({ challenge, participants: participants.filter((item) => String(item.challengeId) === challenge.id).length, submissions: submissions.filter((item) => String(item.challengeId) === challenge.id).length, votes: votes.filter((item) => String(item.challengeId) === challenge.id).length }));
  const max = Math.max(1, ...rows.map((row) => row.participants + row.submissions + row.votes));
  const dated = [...participants, ...submissions, ...votes].filter(itemDate);
  const liveTrend = Array.from({ length: 6 }, (_, index) => { const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - (5 - index)); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setMonth(end.getMonth() + 1); return { label: start.toLocaleDateString(undefined, { month: "short" }), value: dated.filter((item) => { const date = itemDate(item)!; return date >= start && date < end; }).length }; });
  const trend = dated.length ? liveTrend : [3, 5, 4, 8, 7, 11].map((value, index) => ({ label: `M${index + 1}`, value }));
  const top = [...rows].sort((a, b) => (b.participants + b.submissions + b.votes) - (a.participants + a.submissions + a.votes))[0];
  const paidVotes = votes.filter((item) => ["confirmed", "paid", "succeeded"].includes(String(item.paymentStatus ?? item.status ?? "").toLowerCase())).length;
  const pendingReviews = submissions.filter((item) => ["pending", "pending_review", "flagged"].includes(String(item.status ?? "").toLowerCase())).length;
  const statuses = [...new Set(data.challenges.map((item) => String(item.status ?? item.lifecycleStatus ?? "draft")))];

  return <section data-creator-analytics className="mt-8 space-y-6">
    <Card className="p-4 sm:p-5"><div data-analytics-filter-row className="grid gap-3 md:grid-cols-3"><AnalyticsSelect label="Date range" value={range} onChange={setRange} options={[["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All recorded time"]]}/><AnalyticsSelect label="Challenge" value={challengeId} onChange={setChallengeId} options={[["all", "All challenges"], ...data.challenges.map((item) => [item.id, String(item.title ?? "Untitled challenge")])]}/><AnalyticsSelect label="Type / status" value={status} onChange={setStatus} options={[["all", "All statuses"], ...statuses.map((item) => [item, item.replaceAll("_", " ")])]}/></div></Card>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[.85fr_1.5fr]"><div data-analytics-primary-metrics className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><Metric label="Participants" value={participants.length}/><Metric label="Submissions" value={submissions.length}/><Metric label="Recorded Votes" value={votes.length}/><Metric label="Sponsor Interest" value={sponsorInterest.length}/></div><Card data-analytics-large-trend className="min-w-0 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Challenge Activity Trend</h2><p className="mt-1 text-sm text-slate-400">Participation, submission, and vote records over time.</p></div>{!dated.length ? <span className="rounded-full bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-300">Preview sample data</span> : null}</div><TrendChart points={trend}/>{!dated.length ? <p className="mt-4 text-sm leading-6 text-slate-400">Connect analytics tracking or record more challenge activity to replace this chart with live trends. Preview values stay in the browser and are never stored or used for reports.</p> : null}</Card></div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[1.5fr_.8fr]"><Card data-analytics-performance-chart className="min-w-0 p-5 sm:p-7"><h2 className="text-xl font-black">Challenge Performance</h2><p className="mt-1 text-sm text-slate-400">Real records grouped by your owned challenges.</p><div className="mt-7 grid gap-5">{rows.map((row) => <div key={row.challenge.id}><div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between"><b data-user-content>{String(row.challenge.title ?? "Untitled challenge")}</b><span className="text-slate-400">{row.participants} participants · {row.submissions} entries · {row.votes} votes</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.max(3, ((row.participants + row.submissions + row.votes) / max) * 100)}%` }}/></div></div>)}{!rows.length ? <p className="text-sm text-slate-400">Create a challenge to begin collecting real performance analytics.</p> : null}</div></Card><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><Insight label="Paid Votes" value={paidVotes.toLocaleString()}/><Insight label="Sponsor Interest" value={sponsorInterest.length.toLocaleString()}/><Insight label="Top Challenge" value={top ? String(top.challenge.title ?? "Untitled challenge") : "No activity yet"} userContent={Boolean(top)}/><Insight label="Pending Reviews" value={pendingReviews.toLocaleString()}/></div></div>
  </section>;
}

function AnalyticsSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="grid gap-2 text-sm font-bold text-slate-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 min-w-0 rounded-[8px] border border-white/10 bg-[#151515] px-3 text-white outline-none focus:border-[var(--gold)]">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function TrendChart({ points }: { points: Array<{ label: string; value: number }> }) { const max = Math.max(1, ...points.map((point) => point.value)); const path = points.map((point, index) => `${index ? "L" : "M"} ${20 + index * 72} ${180 - (point.value / max) * 140}`).join(" "); return <div className="mt-6 overflow-x-auto"><svg data-internal-svg-chart viewBox="0 0 400 220" className="h-64 min-w-[380px] w-full" role="img" aria-label="Challenge activity trend"><path d="M20 180 H380" stroke="currentColor" className="text-white/10"/><path d={path} fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{points.map((point, index) => <g key={point.label}><circle cx={20 + index * 72} cy={180 - (point.value / max) * 140} r="5" fill="var(--gold)"/><text x={20 + index * 72} y="207" textAnchor="middle" fill="#94a3b8" fontSize="12">{point.label}</text></g>)}</svg></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-[var(--gold)]">{value.toLocaleString()}</p></Card>; }
function Insight({ label, value, userContent = false }: { label: string; value: string; userContent?: boolean }) { return <Card className="p-5"><p className="text-sm text-slate-400">{label}</p><p data-user-content={userContent || undefined} className="mt-2 break-words text-xl font-black text-white">{value}</p></Card>; }
