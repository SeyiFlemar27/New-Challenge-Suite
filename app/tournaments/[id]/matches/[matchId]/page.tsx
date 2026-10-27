import { Flag, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaGallery } from "@/components/media-display";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { TournamentMatchActions as ClientTournamentMatchActions } from "@/components/tournament-match-actions";
import type { ComponentProps } from "react";
import { publicTournamentView } from "@/lib/server/tournament-public-policy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { currentParticipantMatch, votingMatchSequence } from "@/lib/tournament-participant-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep owner uploads, payment evidence, account IDs and private moderation history out of client props.
function TournamentMatchActions(props: ComponentProps<typeof ClientTournamentMatchActions>) {
  const pick = (row: Record<string, unknown>, fields: string[]) => Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]]));
  const tournament = publicTournamentView({ ...props.tournament, id: props.tournamentId });
  return <ClientTournamentMatchActions key={String(props.match.id)} {...props}
    tournament={{ ...tournament, productPolicyVersion: props.tournament.productPolicyVersion, voting: pick((props.tournament.voting as Record<string, unknown> | undefined) ?? {}, ["paidVotesActive", "automaticFreeFirst"]) }}
    match={pick(props.match, ["id", "participantAId", "participantBId", "status", "resultMethod", "resultStatus", "submissionDeadlineAt", "votingClosesAt"])}
    round={props.round ? pick(props.round, ["id", "acceptedMedia"]) : null}
    submissions={props.submissions.map(submission => pick(submission, ["id", "participantId", "status", "mediaUrl", "mediaType", "revision"]))}
  />;
}

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
      if (participant?.exists && participant.data()?.tournamentId === id) {
        competitorId = participant.id;
        canSubmitForRole = !["withdrawn", "rejected", "refunded", "disqualified"].includes(String(participant.data()?.status));
      }
    }
    isManager = canPerformTournamentRole({ uid: viewerId, role: viewer?.role, isAdmin: viewer?.isAdmin }, tournament, ["host", "manager", "moderator"]).allowed;
  }
  const round = bundle.rounds.find((item) => String(item.id) === String(match?.roundId ?? "")) ?? null;
  const sideIds = match ? [match.participantAId, match.participantBId].filter((value): value is string => typeof value === "string" && Boolean(value)) : [];
  const statusDocs = tournament && match ? await Promise.all(sideIds.map(participantId => getAdminDb()?.collection("tournamentSubmissions").doc(id + "_" + matchId + "_" + participantId).get())) : [];
  const submitted = new Map(sideIds.map((participantId, index) => [participantId, ["submitted", "pending_moderation", "under_review", "approved"].includes(String(statusDocs[index]?.data()?.status))]));
  const phaseLabel = match?.reviewRestricted === true || match?.resultStatus === "under_review" ? "Match Result Under Review" : match?.status === "double_forfeit_hold" ? "Both Competitors Forfeited — No Winner" : match?.status === "forfeit" ? "Won by Forfeit" : match?.status === "confirmed" ? "Match Results" : match?.status === "voting_open" ? "Voting in Progress" : ["voting_closed", "result_verification"].includes(String(match?.status)) ? "Results Being Verified" : match?.status === "submissions_open" ? "Submissions Open" : match?.status === "submission_review" ? "Entries Being Reviewed" : "Awaiting Next Opponent";
  const votingMatches = votingMatchSequence(bundle.matches, competitorId, viewerId === String(tournament?.hostId ?? ""));
  const votingIndex = votingMatches.findIndex(item => item.id === matchId);
  const previousVotingMatch = votingIndex > 0 ? votingMatches[votingIndex - 1] : null;
  const nextVotingMatch = votingMatches[votingIndex + 1];
  const nextOwnMatch = currentParticipantMatch(bundle.matches.filter(item => item.id !== matchId), competitorId);
  return <AppShell><PageTitle title={String(tournament?.title ?? "Tournament Match")} subtitle="Follow your match, deadlines and verified results." icon={<Swords />} />{!match || !tournament ? <Card className="mt-6"><EmptyState icon={<Swords />} title="Match unavailable" body="This match has not been generated or cannot be loaded from backend state." /></Card> : <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]"><div><h2 role="status" className="mb-5 text-xl font-bold">{phaseLabel}</h2><div className="grid gap-5 md:grid-cols-2">{sideIds.filter(participantId => !submissions.some(entry => entry.participantId === participantId)).map(participantId => <Card key={participantId} className="flex min-h-48 flex-col items-center justify-center p-5"><Swords aria-hidden="true"/><p className="mt-3 font-bold">{submitted.get(participantId) ? "Submitted" : "Not Yet Submitted"}</p><p className="mt-2 text-sm text-slate-600">Entries are private until voting opens.</p></Card>)}{submissions.map((submission) => <Card key={String(submission.id)} className="overflow-hidden"><ChallengeMediaGallery title={submission.participantId === match.participantAId ? "Entry A" : "Entry B"} videoUrl={submission.mediaType === "video" ? String(submission.mediaUrl ?? "") : ""} images={submission.mediaType === "video" ? [] : [String(submission.mediaUrl ?? "")]} /><div className="p-4"><p className="font-black">{submission.participantId === competitorId ? "Your entry" : submission.participantId === match.participantAId ? "Entry A" : "Entry B"}</p><p className="mt-1 text-sm text-slate-400">{String(submission.status ?? "submitted")}</p></div></Card>)}{!submissions.length ? <Card><EmptyState icon={<Swords />} title="No submissions yet" body="Uploaded tournament submissions will appear after backend confirmation." /></Card> : null}</div><TournamentMatchActions tournamentId={id} tournament={tournament} match={match} round={round} submissions={submissions} viewerId={viewerId} competitorId={competitorId} canSubmitForRole={canSubmitForRole} isHost={viewerId === String(tournament.hostId ?? "")} isManager={isManager} /></div><aside className="space-y-4">{votingMatches.length ? <Card className="p-5"><h2 className="text-lg font-bold">Vote Through Matches</h2><p className="mt-2 text-sm text-slate-600">{votingIndex >= 0 ? `Match ${votingIndex + 1} of ${votingMatches.length}` : `${votingMatches.length} open matches`} · Live totals stay hidden.</p><nav aria-label="Voting match navigation" className="mt-4 flex flex-wrap gap-2">{previousVotingMatch ? <LinkButton variant="secondary" href={`/tournaments/${id}/matches/${previousVotingMatch.id}`}>Previous</LinkButton> : null}{nextVotingMatch ? <><LinkButton variant="secondary" href={`/tournaments/${id}/matches/${nextVotingMatch.id}`}>Skip</LinkButton><LinkButton href={`/tournaments/${id}/matches/${nextVotingMatch.id}`}>{votingIndex < 0 ? "Start Voting" : "Next Match"}</LinkButton></> : null}<LinkButton variant="secondary" href={`/tournaments/${id}/bracket`}>View Bracket</LinkButton></nav><p className="mt-3 text-xs text-slate-500">Navigation never casts a vote or spends DoroCoins. The server checks voting eligibility for every vote.</p></Card> : null}{competitorId && ["confirmed", "forfeit", "double_forfeit_hold"].includes(String(match.status)) ? <Card className="p-5">{nextOwnMatch?.participantAId && nextOwnMatch.participantBId ? <LinkButton href={"/tournaments/" + id + "/matches/" + nextOwnMatch.id}>View Next Match</LinkButton> : <p>Awaiting Next Opponent</p>}</Card> : null}<Card className="p-5"><h2 className="text-xl font-black">Match State</h2><p className="mt-3 text-sm text-slate-400">Round {String(match.roundNumber)} Match {String(match.matchNumber)}</p><p className="mt-2 text-sm text-slate-400">{phaseLabel}</p><p className="mt-2 text-sm text-slate-400">Result: {String(match.resultStatus ?? "not confirmed")}</p>{hasVerifiedVoteTally && match.status === "confirmed" ? <p className="mt-3 rounded-xl border border-[var(--line)] p-3 text-sm font-semibold" aria-label="Verified final vote tally">Verified final votes: {String(match.verifiedVoteCountA)} – {String(match.verifiedVoteCountB)}</p> : null}</Card><Card className="p-5"><Flag className="text-[var(--gold)]" /><p className="mt-3 text-sm text-slate-400">Live public vote totals stay hidden. A final tally appears only after the server confirms the match result.</p></Card></aside></div>}</AppShell>;
}
