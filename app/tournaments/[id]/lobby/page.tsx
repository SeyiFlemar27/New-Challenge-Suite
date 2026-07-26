import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export default async function TournamentLobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  return <AppShell><PageTitle title="Tournament Lobby" subtitle="Registration status, announcements, rules, schedule, participants, check-in, and bracket state from backend records." icon={<Megaphone />} /><div className="mt-7 grid gap-5 lg:grid-cols-2"><Card className="p-5"><h2 className="text-xl font-black">Next Action</h2><p className="mt-3 text-slate-400">{bundle.tournament ? "Review registration state, check-in requirements, and bracket release status." : "Tournament unavailable."}</p><LinkButton href={`/tournaments/${id}/me`} className="mt-5">Open My Dashboard</LinkButton></Card><Card className="p-5"><h2 className="text-xl font-black">Announcements</h2>{bundle.announcements.length ? bundle.announcements.map((item) => <p key={String(item.id)} className="mt-3 text-sm text-slate-400">{String(item.title ?? "Announcement")}</p>) : <EmptyState icon={<Megaphone />} title="No announcements" body="Host updates will appear here when published from backend state." />}</Card><Card className="p-5"><h2 className="text-xl font-black">Participants</h2><p className="mt-3 text-sm text-slate-400">{bundle.participants.length} backend participant records loaded.</p></Card><Card className="p-5"><h2 className="text-xl font-black">Bracket Status</h2><p className="mt-3 text-sm text-slate-400">{bundle.matches.length ? "Bracket generated." : "Bracket not generated yet."}</p></Card></div></AppShell>;
}
