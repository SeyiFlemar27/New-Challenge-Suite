import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sections = ["Overview", "Participants", "Applications", "Waitlist", "Bracket", "Rounds", "Matches", "Submissions", "Voting", "Judges", "Leaderboard", "Announcements", "Sponsors", "Prize Pool", "Reports", "Disputes", "Analytics", "Settings", "Audit"];

export default async function TournamentManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  const pendingApplications = bundle.participants.filter((item) => item.status === "pending_approval").length;
  const flaggedMatches = bundle.matches.filter((item) => ["review", "disputed"].includes(String(item.status))).length;
  return <AppShell><PageTitle title="Tournament Command Center" subtitle="Host operations for participants, bracket, rounds, judging, sponsors, reports, disputes, and audit activity." icon={<ClipboardList />} /><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sections.map((section) => <Card key={section} className="p-4"><p className="font-black">{section}</p><p className="mt-2 text-sm text-slate-500">Backend state only.</p></Card>)}</div><aside className="space-y-5"><Card className="p-5"><h2 className="text-xl font-black">Requires Attention</h2><p className="mt-3 text-sm text-slate-400">Pending applications: {pendingApplications}</p><p className="mt-2 text-sm text-slate-400">Flagged matches: {flaggedMatches}</p><p className="mt-2 text-sm text-slate-400">Prize funding incomplete: {Number(((bundle.tournament as any)?.prizePool)?.confirmedPrizePoolMinor ?? 0) <= 0 ? "Yes" : "No"}</p></Card><Card className="p-5"><h2 className="text-xl font-black">Tournament Health</h2>{["Registration", "Bracket", "Submissions", "Voting", "Flagged Matches", "Prize Funding", "Sponsors"].map((item) => <p key={item} className="mt-2 text-sm text-slate-400">{item}: backend-derived</p>)}</Card><LinkButton href={`/tournaments/${id}`} className="w-full" variant="secondary">Public Page</LinkButton></aside></div></AppShell>;
}
