import { ShieldCheck } from "lucide-react";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { getTournamentBundle } from "@/lib/server/tournament-public";

export default async function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getTournamentBundle(id);
  if (!bundle.tournament) return <Card><EmptyState icon={<ShieldCheck />} title="Tournament unavailable" body="Admin tournament detail requires an existing backend tournament record." /></Card>;
  return <><PageTitle title={String((bundle.tournament as any).title ?? "Tournament")} subtitle="Admin tournament detail foundation. Sensitive actions are permission-gated and audited through API routes." icon={<ShieldCheck />} /><div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[
    ["Participants", bundle.participants.length],
    ["Rounds", bundle.rounds.length],
    ["Matches", bundle.matches.length],
    ["Submissions", bundle.submissions.length],
    ["Sponsors", bundle.sponsors.length],
    ["Placements", bundle.placements.length],
    ["Audit Events", bundle.audits.length]
  ].map(([label, value]) => <Card key={String(label)} className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{String(value)}</p></Card>)}</div><Card className="mt-6 p-5 text-sm leading-6 text-slate-300">Admin actions supported by foundation: approve, reject, pause, resume, cancel, lock voting, reopen review, resolve dispute, disqualify, confirm result, approve payout foundation, trigger safe refund workflow foundation. No payout provider, refund provider, raw vote edit, or balance overwrite is executed.</Card></>;
}
