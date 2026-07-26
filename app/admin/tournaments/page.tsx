import { ShieldAlert, Trophy } from "lucide-react";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { getAdminDb } from "@/lib/firebase/admin";

const views = ["pending_review", "scheduled", "registration_open", "active", "flagged", "disputed", "payout_pending", "completed", "cancelled"];

export default async function AdminTournamentsPage() {
  const db = getAdminDb();
  const snap = db ? await db.collection("tournaments").orderBy("updatedAt", "desc").limit(100).get() : null;
  const tournaments = (snap?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) ?? []) as Array<Record<string, unknown> & { id: string }>;
  return <><PageTitle title="Admin Tournaments" subtitle="Inspect tournament state, participants, rounds, matches, submissions, votes, judges, sponsorship, reports, disputes, audits, and payout foundation status." icon={<Trophy />} /><div className="mt-6 flex flex-wrap gap-2">{views.map((view) => <span key={view} className="rounded-[8px] border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">{view.replaceAll("_", " ")}</span>)}</div>{!db || !tournaments.length ? <Card className="mt-8"><EmptyState icon={<ShieldAlert />} title="No admin tournament records" body={!db ? "Firebase Admin is required to load tournament admin records." : "Real tournament records will appear here when hosts create them."} /></Card> : <div className="mt-8 grid gap-5 xl:grid-cols-2">{tournaments.map((item) => <Card key={String(item.id)} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{String(item.status ?? "draft")}</p><h2 className="mt-2 text-xl font-black">{String(item.title ?? "Tournament")}</h2><p className="mt-3 text-sm text-slate-400">Participants: {Number(item.participantCount ?? 0)} / {Number(item.participantCapacity ?? 0)}</p><p className="mt-2 text-sm text-slate-400">Admin actions require audit logs. Raw vote totals and balances are not directly editable.</p><LinkButton href={`/admin/tournaments/${String(item.id)}`} className="mt-5">Inspect</LinkButton></Card>)}</div>}</>;
}
