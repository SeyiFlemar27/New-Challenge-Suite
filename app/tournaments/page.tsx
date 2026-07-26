import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { listPublicTournaments, tournamentSections } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function friendly(value: unknown) {
  return String(value ?? "not available").replaceAll("_", " ");
}

function prizeLabel(tournament: Record<string, unknown>) {
  const cents = Number((tournament.prizePool as Record<string, unknown> | undefined)?.confirmedPrizePoolMinor ?? 0);
  return cents > 0 ? `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "Prize not funded yet";
}

export default async function TournamentsPage() {
  const result = await listPublicTournaments();
  const sections = tournamentSections(result.tournaments);
  return (
    <AppShell>
      <PageTitle title="Tournaments" subtitle="Discover real tournament records with registration, bracket, rounds, sponsor, prize, and archive states." icon={<Trophy />} />
      <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-400">
        {["category", "status", "entry type", "capacity", "single elimination", "eligibility"].map((filter) => <span key={filter} className="rounded-[8px] border border-white/10 px-3 py-2">{filter}</span>)}
      </div>
      {!result.available || !sections.length ? <Card className="mt-8"><EmptyState icon={<Trophy />} title="No tournaments yet" body={result.message || "Real public tournaments will appear here after hosts publish them."} action={<LinkButton href="/tournaments/create">Create Tournament</LinkButton>} /></Card> : null}
      <div className="mt-8 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-2xl font-black">{section.title}</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {section.rows.map((tournament) => (
                <Card key={String(tournament.id)} className="overflow-hidden">
                  <ChallengeMediaFrame src={String((tournament.coverMedia as Record<string, unknown> | undefined)?.url ?? "")} alt={String(tournament.title ?? "Tournament cover")} placeholder="Challenge Suite Tournament" />
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{friendly(tournament.status)}</p>
                    <h3 className="mt-2 text-xl font-black">{String(tournament.title ?? "Untitled tournament")}</h3>
                    <dl className="mt-4 grid gap-2 text-sm text-slate-400">
                      <div className="flex justify-between gap-3"><dt>Host</dt><dd className="break-all text-right">{String(tournament.hostId ?? "Host unavailable")}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Category</dt><dd>{String(tournament.category ?? "Uncategorized")}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Participants</dt><dd>{Number(tournament.participantCount ?? 0)} / {Number(tournament.participantCapacity ?? 0)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Entry</dt><dd>{friendly(tournament.entryType)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Prize</dt><dd>{prizeLabel(tournament)}</dd></div>
                    </dl>
                    <LinkButton href={`/tournaments/${String(tournament.id)}`} className="mt-5 w-full">View Tournament</LinkButton>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
