import { Flag, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmissionMediaFrame } from "@/components/media-display";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentMatchPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  const bundle = await getTournamentBundle(id);
  const match = bundle.matches.find((item) => String(item.id) === matchId);
  const submissions = bundle.submissions.filter((item) => String(item.matchId) === matchId);
  return <AppShell><PageTitle title="Tournament Match" subtitle="Official match state, submissions, voting, judging, report controls, and result visibility come from backend records." icon={<Swords />} />{!match ? <Card className="mt-6"><EmptyState icon={<Swords />} title="Match unavailable" body="This match has not been generated or cannot be loaded from backend state." /></Card> : <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]"><div className="grid gap-5 md:grid-cols-2">{submissions.map((submission) => <Card key={String(submission.id)} className="overflow-hidden"><SubmissionMediaFrame src={String(submission.mediaUrl ?? "")} alt="Tournament submission" placeholder="Submission media" /><div className="p-4"><p className="font-black">{String(submission.participantId ?? "Participant")}</p><p className="mt-1 text-sm text-slate-400">{String(submission.status ?? "submitted")}</p></div></Card>)}{!submissions.length ? <Card><EmptyState icon={<Swords />} title="No submissions yet" body="Uploaded tournament submissions will appear after backend confirmation." /></Card> : null}</div><aside className="space-y-4"><Card className="p-5"><h2 className="text-xl font-black">Match State</h2><p className="mt-3 text-sm text-slate-400">Round {String(match.roundNumber)} Match {String(match.matchNumber)}</p><p className="mt-2 text-sm text-slate-400">Status: {String(match.status)}</p><p className="mt-2 text-sm text-slate-400">Result: {String(match.resultStatus ?? "not confirmed")}</p></Card><Card className="p-5"><Flag className="text-[var(--gold)]" /><p className="mt-3 text-sm text-slate-400">Reports, disputes, and overrides require host/admin review and audit logging. Raw vote totals are not editable from this page.</p></Card></aside></div>}</AppShell>;
}
