import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyTournamentDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  const currentMatch = bundle.matches.find((match) => ["ready", "active", "awaiting_result", "review"].includes(String(match.status)));
  return <AppShell><PageTitle title="My Tournament" subtitle="A participant-focused dashboard for next action, current matchup, submission, bracket, leaderboard, announcements, rules, and history." icon={<Target />} /><Card className="mt-6 border-[var(--gold)]/20 p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Next Action</p><h2 className="mt-2 text-2xl font-black">{currentMatch ? "Review your current match" : "Wait for tournament progression"}</h2><p className="mt-3 text-slate-400">{currentMatch ? `Match ${String(currentMatch.matchNumber)} is ${String(currentMatch.status)}.` : "Your next action appears after registration, bracket generation, or round start."}</p>{currentMatch ? <LinkButton href={`/tournaments/${id}/matches/${String(currentMatch.id)}`} className="mt-5">Open Match</LinkButton> : null}</Card><div className="mt-6 grid gap-4 md:grid-cols-4">{["Overview", "My Match", "Submission", "Bracket", "Leaderboard", "Announcements", "Rules", "History"].map((tab) => <Card key={tab} className="p-4 text-sm font-bold text-slate-300">{tab}</Card>)}</div></AppShell>;
}
