import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentPlacementReview } from "@/components/tournament-placement-review";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  const placements = [...bundle.placements].sort((a, b) => Number(a.placement ?? 999) - Number(b.placement ?? 999));
  const finalized = ["winners_announced", "completed"].includes(String(bundle.tournament?.status)) && bundle.tournament?.adminWinnerApprovalStatus === "approved";
  const canReview = Boolean(viewer && bundle.tournament && ["under_review", "final"].includes(String(bundle.tournament.status)) && canPerformTournamentRole({ ...viewer }, bundle.tournament, ["host", "manager"]).allowed);
  const names = new Map(bundle.participants.map((participant, index) => [participant.id, participant.publicDisplayName === true ? String(participant.displayName ?? `Entrant ${index + 1}`) : `Entrant ${index + 1}`]));
  return <AppShell><div className="mx-auto max-w-5xl">
    <PageTitle title={`${String(bundle.tournament?.title ?? "Tournament")} Results`} subtitle={finalized ? "Admin-approved placements from verified competition results." : "Competition-derived placements remain provisional until Admin approval."} icon={<Trophy />} />
    {placements.length ? <div className="mt-8 grid gap-4">{placements.map(item => <Card key={item.id} className="p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black uppercase text-[var(--gold)]">Place {Number(item.placement)}</p><h2 className="mt-2 text-xl font-black">{names.get(String(item.participantId)) ?? "Verified entrant"}</h2><p className="mt-1 text-sm text-slate-500">{finalized ? "Official placement" : "Awaiting final approval"}</p><p className="mt-1 text-sm text-slate-500">Allocation status: {String(item.payoutStatus ?? "not_started").replaceAll("_", " ")}. This does not confirm an external payout.</p></div><LinkButton href={`/tournaments/${id}`} variant="secondary">Tournament</LinkButton></div></Card>)}</div> : <Card className="mt-8"><EmptyState icon={<Trophy />} title="Results under review" body="Verified competition-derived placements will appear when the relevant matches conclude." /></Card>}
    {canReview && placements.length ? <TournamentPlacementReview id={id} /> : null}
  </div></AppShell>;
}
