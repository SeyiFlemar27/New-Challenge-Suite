import { Flag, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmissionMediaFrame } from "@/components/media-display";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { TournamentMatchActions } from "@/components/tournament-match-actions";
import { getAdminDb } from "@/lib/firebase/admin";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentMatchPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  const match = bundle.matches.find((item) => String(item.id) === matchId);
  const submissions = bundle.submissions.filter((item) => String(item.matchId) === matchId);
  const hasVerifiedVoteTally = Number.isSafeInteger(match?.verifiedVoteCountA) && Number.isSafeInteger(match?.verifiedVoteCountB);
  const tournament = bundle.tournament;
  const viewerId = viewer?.emailVerified ? viewer.uid : null;
  let competitorId: string | null = null;
  let canSubmitForRole = false;
  let isManager = false;
  if (viewerId && tournament) {
    if (String(tournament.participationMode) === "team") {
      const membership = await getAdminDb()?.collection("tournamentTeamMemberships").doc(`${id}_${viewerId}`).get();
      if (membership?.exists && membership.data()?.status === "active") {
        competitorId = String(membership.data()?.teamId ?? "") || null;
        canSubmitForRole = membership.data()?.role === "captain";
      }
    } else {
      const participant = await getAdminDb()?.collection("tournamentParticipants").doc(`${id}_${viewerId}`).get();
      if (participant?.exists && !["withdrawn", "rejected", "disqualified"].includes(String(participant.data()?.status))) {
        competitorId = participant.id;
        canSubmitForRole = true;
      }
    }
    isManager = canPerformTournamentRole({ uid: viewerId, role: viewer?.role, isAdmin: viewer?.isAdmin }, tournament, ["host", "manager", "moderator"]).allowed;
  }
  const round = bundle.rounds.find((item) => String(item.id) === String(match?.roundId ?? "")) ?? null;
  return <AppShell><PageTitle title="Tournament Match" subtitle="Official match state, submissions, vote confidentiality, and verified result visibility come from server records." icon={<Swords />} />{!match || !tournament ? <Card className="mt-6"><EmptyState icon={<Swords />} title="Match unavailable" body="This match has not been generated or cannot be loaded from backend state." /></Card> : <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]"><div><div className="grid gap-5 md:grid-cols-2">{submissions.map((submission) => <Card key={String(submission.id)} className="overflow-hidden"><SubmissionMediaFrame src={String(submission.mediaUrl ?? "")} alt="Tournament submission" placeholder="Submission media" /><div className="p-4"><p className="font-black">{String(submission.participantId ?? "Participant")}</p><p className="mt-1 text-sm text-slate-400">{String(submission.status ?? "submitted")}</p></div></Card>)}{!submissions.length ? <Card><EmptyState icon={<Swords />} title="No submissions yet" body="Uploaded tournament submissions will appear after backend confirmation." /></Card> : null}</div><TournamentMatchActions tournamentId={id} tournament={tournament} match={match} round={round} submissions={submissions} viewerId={viewerId} competitorId={competitorId} canSubmitForRole={canSubmitForRole} isHost={viewerId === String(tournament.hostId ?? "")} isManager={isManager} /></div><aside className="space-y-4"><Card className="p-5"><h2 className="text-xl font-black">Match State</h2><p className="mt-3 text-sm text-slate-400">Round {String(match.roundNumber)} Match {String(match.matchNumber)}</p><p className="mt-2 text-sm text-slate-400">Status: {String(match.status)}</p><p className="mt-2 text-sm text-slate-400">Result: {String(match.resultStatus ?? "not confirmed")}</p>{hasVerifiedVoteTally ? <p className="mt-3 rounded-xl border border-[var(--line)] p-3 text-sm font-semibold" aria-label="Verified final vote tally">Verified final votes: {String(match.verifiedVoteCountA)} – {String(match.verifiedVoteCountB)}</p> : null}</Card><Card className="p-5"><Flag className="text-[var(--gold)]" /><p className="mt-3 text-sm text-slate-400">Live public vote totals stay hidden. A final tally appears only after the server confirms the match result.</p></Card></aside></div>}</AppShell>;
}
