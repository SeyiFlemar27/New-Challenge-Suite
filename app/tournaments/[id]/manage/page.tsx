import { NormalPublishedDetailsEditor } from "@/components/normal-published-details-editor";
import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { notFound } from "next/navigation";
import { TournamentSponsorshipManagement } from "@/components/tournament-sponsorship-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  if (!viewer || !bundle.available || !bundle.tournament || !canEditTournament({ ...viewer }, bundle.tournament).allowed) notFound();
  const pendingApplications = bundle.participants.filter((item) => item.status === "pending_approval").length;
  const flaggedMatches = bundle.matches.filter((item) => ["review", "disputed"].includes(String(item.status))).length;
  return <AppShell><PageTitle title="Tournament Command Center" subtitle={String(bundle.tournament.title ?? "Tournament management")} icon={<ClipboardList />} /><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="space-y-5"><TournamentSponsorshipManagement tournamentId={id} /><Card className="space-y-3 p-5"><h2 className="text-xl font-bold">Matches and moderation</h2>{bundle.matches.length ? bundle.matches.map(match => <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3"><p>Match {Number(match.matchNumber)} · {String(match.status).replaceAll("_", " ")}</p><LinkButton href={`/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(match.id)}`} variant="secondary">View match</LinkButton></div>) : <p>The bracket appears after verified full capacity.</p>}</Card><Card className="p-5"><h2 className="text-xl font-bold">Audit history</h2>{bundle.audits.length ? <ul className="mt-3 space-y-2 text-sm">{bundle.audits.slice(0, 30).map(audit => <li key={audit.id}>{String(audit.action).replaceAll("_", " ")} · {String(audit.createdAt ?? "")}</li>)}</ul> : <p className="mt-3">No audit events yet.</p>}</Card></div><aside className="space-y-5">{bundle.tournament.publishedAt ? <NormalPublishedDetailsEditor source="tournaments" challenge={bundle.tournament} challengeId={id} /> : null}<Card className="space-y-3 p-5"><h2 className="text-xl font-black">Current state</h2><p>Status: {String(bundle.tournament.status).replaceAll("_", " ")}</p><p>Confirmed entrants: {Number(bundle.tournament.participantCount ?? 0)} / {Number(bundle.tournament.participantCapacity)}</p>{pendingApplications ? <p>Historical pending applications: {pendingApplications}</p> : null}<p>Flagged matches: {flaggedMatches}</p><p>Financial review: {bundle.tournament.financialHold ? "Required" : "No Tournament-wide hold recorded"}</p></Card><LinkButton href={`/tournaments/${id}`} className="w-full" variant="secondary">Tournament page</LinkButton><LinkButton href={`/tournaments/${id}/results`} className="w-full" variant="secondary">Results and allocation review</LinkButton></aside></div></AppShell>;
}
