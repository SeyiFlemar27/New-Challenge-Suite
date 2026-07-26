import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { listPublicTournaments } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyTournamentsPage() {
  const result = await listPublicTournaments(25);
  return <AppShell><PageTitle title="My Tournaments" subtitle="Active, upcoming, completed, eliminated, and hosted tournament records remain archive-visible when backend results exist." icon={<Trophy />} /><div className="mt-6 flex flex-wrap gap-3">{["Active", "Upcoming", "Completed", "Eliminated", "Hosted"].map((tab) => <span key={tab} className="rounded-[8px] border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">{tab}</span>)}</div>{!result.tournaments.length ? <Card className="mt-8"><EmptyState icon={<Trophy />} title="No tournament history yet" body="Real entered, hosted, eliminated, and completed tournaments will appear here from backend records." action={<LinkButton href="/tournaments">Browse Tournaments</LinkButton>} /></Card> : <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{result.tournaments.map((item) => <Card key={String(item.id)} className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">{String(item.status ?? "draft")}</p><h2 className="mt-2 text-xl font-black">{String(item.title ?? "Tournament")}</h2><p className="mt-3 text-sm text-slate-400">Next action is calculated from participant, match, and round records.</p><LinkButton href={`/tournaments/${String(item.id)}`} className="mt-5 w-full">Open</LinkButton></Card>)}</div>}</AppShell>;
}
