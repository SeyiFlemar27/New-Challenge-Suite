import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getServerTournamentViewer, getTournamentBundle } from "@/lib/server/tournament-public";
import { TournamentPlacementReview } from "@/components/tournament-placement-review";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import { getAdminDb } from "@/lib/firebase/admin";
import { tournamentResultAllocation } from "@/lib/tournament-results-view";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getServerTournamentViewer();
  const bundle = await getTournamentBundle(id, viewer);
  if (!bundle.available || !bundle.tournament) return <AppShell><Card><EmptyState icon={<Trophy />} title="Tournament unavailable" body="This Tournament cannot be viewed with the current access." /></Card></AppShell>;
  const placements = [...bundle.placements].sort((a, b) => Number(a.placement ?? 999) - Number(b.placement ?? 999));
  const finalized = ["winners_announced", "completed"].includes(String(bundle.tournament?.status)) && (bundle.tournament?.adminWinnerApprovalStatus === "approved" || bundle.tournament?.automaticWinnerVerificationStatus === "verified") && bundle.tournament.financialHold !== true;
  const canReview = Boolean(viewer && bundle.tournament && ["under_review", "final"].includes(String(bundle.tournament.status)) && canPerformTournamentRole({ ...viewer }, bundle.tournament, ["host", "manager"]).allowed);
  const names = new Map(bundle.participants.map((participant, index) => [participant.id, participant.publicDisplayName === true ? String(participant.displayName ?? `Entrant ${index + 1}`) : `Entrant ${index + 1}`]));
  const settlementId = typeof bundle.tournament.settlementId === "string" ? bundle.tournament.settlementId : "";
  const settlement = finalized && settlementId && !settlementId.includes("/") ? (await getAdminDb()?.collection("challengeSettlements").doc(settlementId).get())?.data() ?? null : null;
  const policy = isIndividualTournamentPolicy(bundle.tournament);
  const reviews = await getAdminDb()?.collection("tournamentDisputes").where("tournamentId", "==", id).limit(131).get();
  const reviewedMatchIds = new Set((reviews?.docs ?? []).filter(row => row.data().status === "open").flatMap(row => Array.isArray(row.data().affectedMatchIds) ? row.data().affectedMatchIds as string[] : []));
  const shares = policy ? [50, 30, 20] : [1, 2, 3].map(position => Number((Array.isArray(bundle.tournament?.prizeDistribution) ? bundle.tournament.prizeDistribution : []).find((row: Record<string, unknown>) => Number(row.placement) === position)?.percent) || null);
  return <AppShell><div className="mx-auto max-w-5xl">
    <PageTitle title={`${String(bundle.tournament?.title ?? "Tournament")} Winners`} subtitle={reviewedMatchIds.size ? "Affected placements are under review; unaffected results retain their recorded status." : finalized ? "Official placements from verified competition results." : "Placements remain provisional until final verification and applicable clearance."} icon={<Trophy />} />
    <nav aria-label="Tournament history" className="mt-5 flex flex-wrap gap-3"><LinkButton href={`/tournaments/${id}`} variant="secondary">Tournament Detail</LinkButton><LinkButton href={`/tournaments/${id}/bracket`} variant="secondary">Bracket History</LinkButton></nav>
    <section aria-label="Winner placements" className="mt-6 grid gap-4 md:grid-cols-3">{[1, 2, 3].map(position => {
      const placement = placements.find(row => Number(row.placement) === position);
      const placementHeld = Boolean(placement && (placement.correctionReviewRestricted === true || reviewedMatchIds.has(String(placement.sourceMatchId))));
      const allocation = finalized && placement && !placementHeld && (reviews?.size ?? 0) <= 130 ? tournamentResultAllocation(settlement, id, position) : null;
      return <Card key={position} className={`p-6 ${position === 1 ? "border-amber-300 bg-amber-50/50" : ""}`}><p className="text-sm font-bold text-amber-800">{position === 1 ? "Winner" : position === 2 ? "Runner-up" : "Third place"}</p><h2 className="mt-3 text-xl font-bold">{placementHeld ? "Placement under review" : placement ? names.get(String(placement.participantId)) ?? "Verified entrant" : "Awaiting verified placement"}</h2><p className="mt-2 text-sm text-slate-600">{shares[position - 1] ? `${shares[position - 1]}% of the applicable distributable prize pool` : "Published allocation terms apply"}</p><p className="mt-4 font-semibold">{allocation ? new Intl.NumberFormat("en-US", { style: "currency", currency: allocation.currency }).format(allocation.amountCents / 100) : "Prize amount awaiting verified allocation"}</p><p className="mt-2 text-sm text-slate-600">{allocation ? "Internal prize allocation recorded. Wallet availability remains subject to its clearance and hold checks." : "No wallet credit or withdrawal is confirmed here."}</p></Card>;
    })}</section>
    <p className="mt-6 text-sm text-slate-600">An internal allocation does not establish that funds are available to withdraw or that an external payout occurred. Missing or disputed placements remain unresolved; no winner or amount is invented.</p>
    {canReview && placements.length ? <TournamentPlacementReview id={id} /> : null}
  </div></AppShell>;
}
