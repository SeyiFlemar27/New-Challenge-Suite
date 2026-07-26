import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle, participantEligibilitySummary } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TournamentJoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  const tournament = bundle.tournament as Record<string, unknown> | null;
  const eligibility = participantEligibilitySummary(tournament);
  return <AppShell><PageTitle title="Join Tournament" subtitle="Registration is finalized by server-side eligibility, capacity, duplicate, invitation, KYC, and rules checks." icon={<ShieldCheck />} /><Card className="mt-6 p-6"><h2 className="text-xl font-black">{String(tournament?.title ?? "Tournament")}</h2><div className="mt-5 grid gap-3">{eligibility.map((item) => <div key={item.label} className="rounded-[8px] border border-white/10 p-4 text-sm"><b>{item.eligible ? "Eligible" : "Ineligible"} - {item.label}</b><p className="mt-1 text-slate-400">{item.reason}</p></div>)}</div><p className="mt-5 text-sm leading-6 text-slate-400">Submitting join/apply calls <code>/api/tournaments/{id}/join</code>. Participant count increments only for confirmed registrations; applications and waitlist entries do not inflate counts.</p><LinkButton href={`/tournaments/${id}`} className="mt-5" variant="secondary">Back to tournament</LinkButton></Card></AppShell>;
}
