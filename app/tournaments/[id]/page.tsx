import { ChallengeSafetyAction } from "@/components/challenge-safety-action";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentDetailContent } from "@/components/tournament-detail-content";
import { publicTournamentView, publicTournamentParticipantIds, publicTournamentParticipantView } from "@/lib/server/tournament-public-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id, await getServerTournamentViewer());
  if (!bundle.available || !bundle.tournament) return <AppShell><Card><EmptyState icon={<Trophy />} title="Tournament unavailable" body={bundle.message || "This tournament could not be loaded from backend state."} /></Card></AppShell>;
  const tournament = publicTournamentView(bundle.tournament);
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
      <div className="mx-auto max-w-7xl">
          <ChallengeMediaFrame src={String((tournament.coverMedia as Record<string, unknown> | undefined)?.url ?? "")} alt={String(tournament.title)} placeholder="Challenge Suite Tournament" />
          {Array.isArray(tournament.galleryMedia) && tournament.galleryMedia.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2">{tournament.galleryMedia.map((media, index) => <ChallengeMediaFrame key={index} src={String((media as { url?: string }).url ?? "")} alt={`${String(tournament.title)} — image ${index + 2}`} placeholder="Tournament image" />)}</div> : null}
          {typeof (tournament.trailerMedia as { url?: string } | undefined)?.url === "string" ? <video controls preload="metadata" className="mt-4 w-full rounded-xl" src={(tournament.trailerMedia as { url: string }).url} aria-label="Tournament promotional video" /> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {tournament.status === "registration_open" && tournament.registrationAvailability !== "temporarily_unavailable" ? <LinkButton href={`/tournaments/${id}/join`}>{tournament.participationMode === "team" ? "Manage team registration" : "Join Tournament"}</LinkButton> : <span className="self-center text-sm text-slate-500">{tournament.registrationAvailability === "temporarily_unavailable" ? "Registration Temporarily Unavailable — scheduling must be verified before entry opens." : "Registration is closed"}</span>}
            <LinkButton href={`/tournaments/${id}/lobby`} variant="secondary">Lobby</LinkButton>
            <LinkButton href={`/tournaments/${id}/me`} variant="ghost">My Tournament</LinkButton>
            {bundle.placements.length ? <LinkButton href={`/tournaments/${id}/results`} variant="secondary">Results</LinkButton> : null}
          </div>
          <ChallengeSafetyAction challengeId={id} source="tournaments" /><PageTitle title={String(tournament.title ?? "Tournament")} subtitle={`${String(tournament.format ?? "").replaceAll("_", " ")} · ${String(tournament.status ?? "").replaceAll("_", " ")}`} icon={<Trophy />} />
          <TournamentDetailContent tournament={tournament} matches={matches} participants={participants} />
          {bundle.sponsors.length ? <section aria-label="Approved Tournament sponsors" className="mt-8 rounded-xl border border-[var(--line)] p-5"><h2 className="text-xl font-bold">Approved sponsors</h2><ul className="mt-3 space-y-2">{bundle.sponsors.map((sponsor, index) => <li key={index}>{String(sponsor.displayName ?? sponsor.brandName ?? "Sponsor")}{typeof sponsor.ctaUrl === "string" && sponsor.ctaUrl.startsWith("https://") ? <> · <a href={sponsor.ctaUrl} rel="sponsored noopener noreferrer" className="font-semibold underline">{String(sponsor.ctaText || "Visit sponsor")}</a></> : null}</li>)}</ul></section> : null}
      </div>
    </AppShell>
  );
}
