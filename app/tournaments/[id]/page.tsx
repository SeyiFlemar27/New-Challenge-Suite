import { ChallengeSafetyAction } from "@/components/challenge-safety-action";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";

import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentDetailContent } from "@/components/tournament-detail-content";
import { publicTournamentView, publicTournamentParticipantIds, publicTournamentParticipantView } from "@/lib/server/tournament-public-policy";
import { ChallengeMediaGallery } from "@/components/media-display";
import { loadPublicCreator } from "@/lib/server/public-creator";
import { currentParticipantMatch, participantMatches } from "@/lib/tournament-participant-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  if (!bundle.available || !bundle.tournament) return <AppShell><Card><EmptyState icon={<Trophy />} title="Tournament unavailable" body={bundle.message || "This tournament could not be loaded from backend state."} /></Card></AppShell>;
  const tournament = publicTournamentView(bundle.tournament);
  const creator = await loadPublicCreator(bundle.tournament.hostId);
  const ownEntry = viewer?.emailVerified && bundle.tournament.participationMode === "individual" ? bundle.participants.find(row => row.userId === viewer.uid) : null;
  const ownHistory = participantMatches(bundle.matches, ownEntry?.id ?? null);
  const ownCurrent = ownEntry && !["disqualified", "withdrawn", "refunded", "rejected"].includes(String(ownEntry.status)) ? currentParticipantMatch(bundle.matches, ownEntry.id) : null;
  const ownPlacement = bundle.placements.find(row => row.participantId === ownEntry?.id);
  const publicIds = publicTournamentParticipantIds(bundle.participants);
  const participants = bundle.participants.filter(participant => !["forming", "pending", "rejected", "withdrawn"].includes(String(participant.status))).map(participant => ({ ...publicTournamentParticipantView(participant, publicIds.get(participant.id)), id: publicIds.get(participant.id)! }));
  const matchFields = ["id", "roundNumber", "matchNumber", "bracket", "status", "resultStatus", "submissionDeadlineAt", "votingClosesAt"];
  const matches = bundle.matches.map(match => {
    const result: Record<string, unknown> & { id: string } = { id: match.id };
    for (const field of matchFields) if (field in match) result[field] = match[field];
    for (const field of ["participantAId", "participantBId", "winnerParticipantId", "loserParticipantId"]) result[field] = publicIds.get(String(match[field])) ?? null;
    return result;
  });
  return (
    <AppShell>
      <div className="mx-auto max-w-[1240px]">
        <LinkButton href="/explore" variant="ghost">← Back to Explore</LinkButton>
        <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
          <div className="min-w-0">
          <ChallengeMediaGallery title={String(tournament.title)} images={[String((tournament.coverMedia as Record<string, unknown> | undefined)?.url ?? ""), ...(Array.isArray(tournament.galleryMedia) ? tournament.galleryMedia.map(media => String((media as { url?: string }).url ?? "")) : [])]} videoUrl={String((tournament.trailerMedia as { url?: string } | undefined)?.url ?? "")} />
          <div className="mt-6 flex flex-wrap gap-3">
            {tournament.status === "registration_open" && tournament.registrationAvailability !== "temporarily_unavailable" ? <LinkButton href={`/tournaments/${id}/join`}>{tournament.participationMode === "team" ? "Manage team registration" : "Join Tournament"}</LinkButton> : <span className="self-center text-sm text-slate-500">{tournament.registrationAvailability === "temporarily_unavailable" ? "Registration Temporarily Unavailable — scheduling must be verified before entry opens." : "Registration is closed"}</span>}
            <LinkButton href={`/tournaments/${id}/lobby`} variant="secondary">Lobby</LinkButton>
            <LinkButton href={`/tournaments/${id}/me`} variant="ghost">My Tournament</LinkButton>
            {bundle.placements.length ? <LinkButton href={`/tournaments/${id}/results`} variant="secondary">Results</LinkButton> : null}
          </div>
          <ChallengeSafetyAction challengeId={id} source="tournaments" /><PageTitle title={String(tournament.title ?? "Tournament")} subtitle={`${String(tournament.format ?? "").replaceAll("_", " ")} · ${String(tournament.status ?? "").replaceAll("_", " ")}`} icon={<Trophy />} />
          <p className="mt-3 text-sm text-slate-600">Hosted by {creator?.displayName ?? "Tournament organizer — public profile unavailable"}</p>
          <TournamentDetailContent tournament={tournament} matches={matches} participants={participants} />
          {bundle.sponsors.length ? <section aria-label="Approved Tournament sponsors" className="mt-8 rounded-xl border border-[var(--line)] p-5"><h2 className="text-xl font-bold">Approved sponsors</h2><ul className="mt-3 space-y-2">{bundle.sponsors.map((sponsor, index) => <li key={index}>{String(sponsor.displayName ?? sponsor.brandName ?? "Sponsor")}{typeof sponsor.ctaUrl === "string" && sponsor.ctaUrl.startsWith("https://") ? <> · <a href={sponsor.ctaUrl} rel="sponsored noopener noreferrer" className="font-semibold underline">{String(sponsor.ctaText || "Visit sponsor")}</a></> : null}</li>)}</ul></section> : null}
          </div>
          <aside className="space-y-5">
            {ownEntry ? <Card className="p-5"><h2 className="text-xl font-bold">Your Tournament</h2><p className="mt-3 text-sm">{ownCurrent?.bracket === "bronze" ? "Third-place match" : String(ownEntry.status).replaceAll("_", " ")}</p><p className="mt-2 text-sm">Recorded losses: {Number(ownEntry.lossCount ?? 0)}</p>{ownPlacement ? <p className="mt-2 text-sm">Recorded placement: {Number(ownPlacement.placement)}. See Winners for verification and allocation status.</p> : null}{ownCurrent ? <LinkButton className="mt-4 w-full" href={`/tournaments/${id}/matches/${ownCurrent.id}`}>View Current Match</LinkButton> : <p className="mt-3 text-sm">{["eliminated", "disqualified", "withdrawn"].includes(String(ownEntry.status)) ? "Your recorded match history remains available below." : "Awaiting Next Opponent"}</p>}<h3 className="mt-5 font-bold">Your match history</h3>{ownHistory.length ? <ul className="mt-2 space-y-2 text-sm">{ownHistory.map(row => <li key={row.id}><a className="underline focus-visible:outline-2" href={`/tournaments/${id}/matches/${row.id}`}>Round {String(row.roundNumber)} · Match {String(row.matchNumber)} · {String(row.status).replaceAll("_", " ")}</a></li>)}</ul> : <p className="mt-2 text-sm">No matches have been assigned yet.</p>}</Card> : null}
            <Card className="p-5"><h2 className="text-xl font-bold">Tournament Information</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-slate-500">Format</dt><dd className="mt-1 font-semibold">{String(tournament.format).replaceAll("_", " ")}</dd></div><div><dt className="text-slate-500">Entrants</dt><dd className="mt-1 font-semibold">{Number(tournament.participantCount ?? 0)} / {Number(tournament.participantCapacity)} {tournament.participationMode === "team" ? "teams" : "individuals"}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1 capitalize">{String(tournament.status).replaceAll("_", " ")}</dd></div>{Number(tournament.currentRoundNumber) > 0 ? <div><dt className="text-slate-500">Current Round</dt><dd>{Number(tournament.currentRoundNumber)}</dd></div> : null}</dl></Card>
            <Card className="p-5"><h2 className="text-xl font-bold">Match Windows</h2><p className="mt-3 text-sm">Submissions: {Number(tournament.submissionDurationHours ?? 48)} hours</p><p className="mt-2 text-sm">Voting: {Number(tournament.votingDurationHours ?? 72)} hours</p><p className="mt-3 text-sm text-slate-500">Each match shows its confirmed deadline when both opponents are ready.</p></Card>
            <Card className="p-5"><h2 className="text-xl font-bold">Prizes &amp; Results</h2><p className="mt-3 text-sm text-slate-600">Published allocations and verified funding are available in Prizes. Official outcomes remain linked to the bracket and match history.</p><LinkButton className="mt-4 w-full" href={"/tournaments/" + id + "/results"} variant="secondary">View Tournament Results</LinkButton></Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
