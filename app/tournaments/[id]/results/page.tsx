import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  const placements = [...bundle.placements].sort((a, b) => Number(a.placement ?? 999) - Number(b.placement ?? 999));
  return <AppShell><div className="mx-auto max-w-5xl"><PageTitle title={`${String(bundle.tournament?.title ?? "Tournament")} Results`} subtitle="Confirmed tournament placements from reviewed match results." icon={<Trophy />} />{placements.length ? <div className="mt-8 grid gap-4">{placements.map((item) => <Card key={String(item.id)} className="p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black uppercase text-[var(--gold)]">Place {String(item.placement)}</p><h2 className="mt-2 text-xl font-black">Participant {String(item.participantId ?? item.userId ?? "record unavailable")}</h2><p className="mt-1 text-sm text-slate-400">Result status: {String(item.status ?? item.resultStatus ?? "confirmed").replaceAll("_", " ")}</p></div><LinkButton href={`/tournaments/${id}`} variant="secondary">Tournament</LinkButton></div></Card>)}</div> : <Card className="mt-8"><EmptyState icon={<Trophy />} title="Results under review" body="Confirmed tournament placements will appear after the final match review." /></Card>}</div></AppShell>;
}