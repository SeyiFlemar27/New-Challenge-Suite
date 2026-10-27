import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentTeamManager } from "@/components/tournament-team-manager";
import { getAdminDb } from "@/lib/firebase/admin";
import { currentParticipantMatch, participantMatches } from "@/lib/tournament-participant-view";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { TournamentEntryWithdrawal } from "@/components/tournament-entry-withdrawal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyTournamentDashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string; session_id?: string }> }) {
  const { id } = await params;
  const paymentQuery = await searchParams;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  const teamMode = String(bundle.tournament?.participationMode ?? "individual") === "team";
  const db = getAdminDb();
  let competitorId: string | null = null;
  let entryRestricted = false;
  let canWithdraw = false;
  let withdrawalState: "ready" | "refund_pending" | null = null;
  if (db && viewer?.emailVerified) {
    const record = await db.collection(teamMode ? "tournamentTeamMemberships" : "tournamentParticipants").doc(`${id}_${viewer.uid}`).get();
    entryRestricted = record.exists && ["disqualified", "withdrawn", "rejected", "refunded"].includes(String(record.data()?.status));
    const tournament = bundle.tournament;
    canWithdraw = Boolean(tournament && isIndividualTournamentPolicy(tournament) && !teamMode && record.data()?.status === "registered" && tournament.status === "registration_open" && Number(tournament.participantCount) < Number(tournament.participantCapacity) && !["provisional", "activated"].includes(String(tournament.activationState)) && !tournament.activationActivatedAt);
    if (tournament && isIndividualTournamentPolicy(tournament) && record.data()?.status === "withdrawn" && tournament.status === "registration_open" && Number(tournament.participantCount) < Number(tournament.participantCapacity)) withdrawalState = tournament.entryType === "free" || record.data()?.paymentStatus === "refunded" ? "ready" : "refund_pending";
    if (record.exists && (teamMode ? record.data()?.status === "active" : !["withdrawn", "rejected", "refunded"].includes(String(record.data()?.status)))) competitorId = teamMode ? String(record.data()?.teamId ?? "") || null : record.id;
  }
  const ownMatches = participantMatches(bundle.matches, competitorId);
  const progressionHeld = ownMatches.some(match => match.reviewRestricted === true || ["under_review", "disputed"].includes(String(match.resultStatus)));
  const currentMatch = entryRestricted ? null : currentParticipantMatch(bundle.matches, competitorId);
  return <AppShell><PageTitle title="My Tournament" subtitle="Your matches, next action and Tournament history." icon={<Target />} /><Card className="mt-6 border-[var(--gold)]/20 p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Next Action</p><h2 className="mt-2 text-2xl font-black">{entryRestricted ? "Entry unavailable for further play" : progressionHeld ? "Affected progression under Admin review" : currentMatch ? "Review your current match" : "Awaiting Next Opponent"}</h2><p className="mt-3 text-slate-600">{currentMatch ? `Match ${String(currentMatch.matchNumber)} is ${String(currentMatch.status)}.` : "Your next action appears after registration, bracket generation, or round start."}</p>{currentMatch ? <LinkButton href={`/tournaments/${id}/matches/${String(currentMatch.id)}`} className="mt-5">Open Match</LinkButton> : null}</Card>{teamMode ? <TournamentTeamManager tournamentId={id} minimumSize={Number((bundle.tournament?.teamConfig as Record<string, unknown> | undefined)?.minimumSize ?? 1)} maximumSize={Number((bundle.tournament?.teamConfig as Record<string, unknown> | undefined)?.maximumSize ?? 20)} entryType={String(bundle.tournament?.entryType ?? "free")} sessionId={paymentQuery.session_id ?? ""} paymentReturn={paymentQuery.payment ?? ""} /> : <div className="mt-6 grid gap-4 sm:grid-cols-3"><Card className="p-5"><h2 className="font-black">My Match</h2><p className="mt-2 text-sm text-slate-600">{currentMatch ? `Round ${String(currentMatch.roundNumber)}, Match ${String(currentMatch.matchNumber)}` : "No active Match."}</p>{currentMatch ? <LinkButton href={`/tournaments/${id}/matches/${String(currentMatch.id)}`} className="mt-4" variant="secondary">Open</LinkButton> : null}</Card><Card className="p-5"><h2 className="font-black">Bracket</h2><p className="mt-2 text-sm text-slate-600">View recorded rounds and confirmed advancement.</p><LinkButton href={`/tournaments/${id}/bracket`} className="mt-4" variant="secondary">View Bracket</LinkButton></Card><Card className="p-5"><h2 className="font-black">History</h2><p className="mt-2 text-sm text-slate-600">{ownMatches.filter((match) => ["confirmed", "forfeit", "bye"].includes(String(match.status))).length} recorded completed Matches.</p><LinkButton href={`/tournaments/${id}/results`} className="mt-4" variant="secondary">View Results</LinkButton></Card></div>}{canWithdraw ? <TournamentEntryWithdrawal tournamentId={id} /> : null}{withdrawalState ? <Card className="mt-6 space-y-3 p-5"><h2 className="font-bold">Entry withdrawn</h2><p>{withdrawalState === "ready" ? "You may apply again while places remain. Current eligibility and rules acceptance are checked again; paid entry requires a fresh payment." : "Your full entry-fee refund is awaiting provider confirmation. Rejoining is unavailable until it is confirmed."}</p>{withdrawalState === "ready" ? <LinkButton href={`/tournaments/${id}/join`} variant="secondary">Review rejoining</LinkButton> : null}</Card> : null}</AppShell>;
}
