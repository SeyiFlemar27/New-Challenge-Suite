"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DailyRow = { date: string; validImpressions?: number; uniqueCtaClicks?: number };

export function SponsorAnalyticsDailyChart({ rows }: { rows: DailyRow[] }) {
  if (!rows.length) return <p className="mt-4 text-sm leading-6 text-slate-600">Daily performance will appear after valid placement impressions or tracked CTA clicks are recorded.</p>;
  return <div className="mt-5 h-72 w-full" aria-label="Daily sponsor placement performance"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="validImpressions" name="Valid impressions" stroke="#b8860b" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="uniqueCtaClicks" name="Tracked CTA clicks" stroke="#047857" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>;
}
