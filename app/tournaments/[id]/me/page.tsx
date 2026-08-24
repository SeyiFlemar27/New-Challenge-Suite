import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentTeamManager } from "@/components/tournament-team-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyTournamentDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  const currentMatch = bundle.matches.find((match) => ["ready", "active", "awaiting_result", "review"].includes(String(match.status)));
  const teamMode = String(bundle.tournament?.participationMode ?? "individual") === "team";
  return <AppShell><PageTitle title="My Tournament" subtitle="Your next action, Team, matchup, submission, bracket, announcements, and competition history." icon={<Target />} /><Card className="mt-6 border-[var(--gold)]/20 p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Next Action</p><h2 className="mt-2 text-2xl font-black">{currentMatch ? "Review your current match" : "Wait for tournament progression"}</h2><p className="mt-3 text-slate-600">{currentMatch ? `Match ${String(currentMatch.matchNumber)} is ${String(currentMatch.status)}.` : "Your next action appears after registration, bracket generation, or round start."}</p>{currentMatch ? <LinkButton href={`/tournaments/${id}/matches/${String(currentMatch.id)}`} className="mt-5">Open Match</LinkButton> : null}</Card>{teamMode ? <TournamentTeamManager tournamentId={id} minimumSize={Number((bundle.tournament?.teamConfig as Record<string, unknown> | undefined)?.minimumSize ?? 1)} maximumSize={Number((bundle.tournament?.teamConfig as Record<string, unknown> | undefined)?.maximumSize ?? 20)} /> : <div className="mt-6 grid gap-4 sm:grid-cols-3"><Card className="p-5"><h2 className="font-black">My Match</h2><p className="mt-2 text-sm text-slate-600">{currentMatch ? `Round ${String(currentMatch.roundNumber)}, Match ${String(currentMatch.matchNumber)}` : "No active Match."}</p>{currentMatch ? <LinkButton href={`/tournaments/${id}/matches/${String(currentMatch.id)}`} className="mt-4" variant="secondary">Open</LinkButton> : null}</Card><Card className="p-5"><h2 className="font-black">Bracket</h2><p className="mt-2 text-sm text-slate-600">View recorded rounds and confirmed advancement.</p><LinkButton href={`/tournaments/${id}/bracket`} className="mt-4" variant="secondary">View Bracket</LinkButton></Card><Card className="p-5"><h2 className="font-black">History</h2><p className="mt-2 text-sm text-slate-600">{bundle.matches.filter((match) => ["confirmed", "forfeit", "bye"].includes(String(match.status))).length} recorded completed Matches.</p><LinkButton href={`/tournaments/${id}/results`} className="mt-4" variant="secondary">View Results</LinkButton></Card></div>}</AppShell>;
}
