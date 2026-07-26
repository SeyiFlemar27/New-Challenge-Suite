import { CalendarDays, Swords, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getTournamentBundle, participantEligibilitySummary } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function friendly(value: unknown) { return String(value ?? "not available").replaceAll("_", " "); }

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  if (!bundle.tournament) return <AppShell><Card><EmptyState icon={<Trophy />} title="Tournament unavailable" body={bundle.message || "This tournament could not be loaded from backend state."} /></Card></AppShell>;
  const tournament = bundle.tournament as Record<string, unknown>;
  const eligibility = participantEligibilitySummary(tournament);
  return (
    <AppShell>
      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <div>
          <ChallengeMediaFrame src={String((tournament.coverMedia as Record<string, unknown> | undefined)?.url ?? "")} alt={String(tournament.title)} placeholder="Challenge Suite Tournament" />
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href={`/tournaments/${id}/join`}>Join / Apply</LinkButton>
            <LinkButton href={`/tournaments/${id}/lobby`} variant="secondary">Lobby</LinkButton>
            <LinkButton href={`/tournaments/${id}/me`} variant="ghost">My Tournament</LinkButton>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card className="p-5"><h2 className="text-xl font-black">Schedule</h2><Info label="Registration closes" value={tournament.registrationClosesAt} /><Info label="Tournament starts" value={tournament.tournamentStartsAt} /><Info label="Expected end" value={tournament.expectedEndAt} /></Card>
            <Card className="p-5"><h2 className="text-xl font-black">Eligibility</h2>{eligibility.map((item) => <div key={item.label} className="mt-3 flex justify-between gap-3 text-sm"><span>{item.eligible ? "OK" : "Blocked"} {item.label}</span><span className="text-right text-slate-400">{item.reason}</span></div>)}</Card>
            <Card className="p-5"><h2 className="text-xl font-black">Bracket</h2>{bundle.matches.length ? <div className="mt-3 space-y-2">{bundle.matches.map((match) => <p key={String(match.id)} className="text-sm text-slate-400">Round {String(match.roundNumber)} Match {String(match.matchNumber)} - {friendly(match.status)}</p>)}</div> : <p className="mt-3 text-sm text-slate-400">Bracket appears after server-side generation.</p>}</Card>
            <Card className="p-5"><h2 className="text-xl font-black">Sponsors</h2>{bundle.sponsors.length ? bundle.sponsors.map((sponsor) => <p key={String(sponsor.id)} className="mt-2 text-sm text-slate-400">Sponsored by {String(sponsor.brandName ?? sponsor.sponsorId ?? "approved sponsor")}</p>) : <p className="mt-3 text-sm text-slate-400">Approved and payment-confirmed sponsor placements will appear here.</p>}</Card>
          </div>
        </div>
        <aside className="space-y-5">
          <PageTitle title={String(tournament.title ?? "Tournament")} subtitle={String(tournament.description ?? "")} icon={<Swords />} />
          <Card className="p-5"><div className="grid gap-4"><Metric icon={<Users />} label="Participants" value={`${Number(tournament.participantCount ?? 0)} / ${Number(tournament.participantCapacity ?? 0)}`} /><Metric icon={<Trophy />} label="Format" value={friendly(tournament.format)} /><Metric icon={<CalendarDays />} label="Status" value={friendly(tournament.status)} /></div></Card>
          <Card className="p-5 text-sm leading-6 text-slate-300">Winner placements, prize allocation, and payout visibility remain admin-reviewed, ledger-gated, KYC-gated, and provider-safe.</Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="mt-3 flex justify-between gap-3 text-sm"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">{value ? String(value) : "Not scheduled"}</span></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-[8px] bg-white/[0.03] p-3"><span className="text-[var(--gold)]">{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="font-black capitalize">{value}</p></div></div>;
}
