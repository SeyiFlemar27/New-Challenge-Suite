"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button, Card, LinkButton } from "@/components/ui";
import { orderTournamentParticipation, type TournamentParticipation } from "@/lib/tournament-smart-priority";
type ParticipationBatch = { tournaments: TournamentParticipation[]; hasMoreScans: boolean; nextScanCursor: string | null };
export function MyTournaments() {
  const { user, loading } = useCurrentUser();
  const [paging, setPaging] = useState({ uid: "", page: 0 });
  const requestedPage = paging.uid === user?.uid ? paging.page : 0;
  const query = useQuery({ queryKey: ["my-tournaments", user?.uid ?? "signed-out"], queryFn: async ({ signal }) => {
    const items = new Map<string, TournamentParticipation>();
    const seen = new Set<string>();
    let cursor = "";
    do {
      if (signal.aborted) throw new Error("Tournament loading cancelled.");
      const response = await apiRequest<ParticipationBatch>(`/api/me/tournaments?cursor=${encodeURIComponent(cursor)}`, { signal });
      if (!response.ok || !response.data) throw new Error("Tournament history unavailable.");
      for (const item of response.data.tournaments) items.set(item.registrationId, item);
      if (!response.data.hasMoreScans) break;
      const next = response.data.nextScanCursor;
      if (!next || seen.has(next)) throw new Error("Tournament history cursor did not advance.");
      seen.add(next);
      cursor = next;
    } while (true);
    return orderTournamentParticipation([...items.values()]);
  }, enabled: Boolean(user) && !loading });
  if (loading || user && query.isLoading) return <p role="status" className="mt-6">Loading your Tournaments…</p>;
  if (!user) return <Card className="mt-6 p-6"><p>Sign in to see your Tournament participation.</p><LinkButton className="mt-4" href="/auth/login?next=%2Fchallenges%3Ftab%3Dtournaments">Sign in</LinkButton></Card>;
  if (query.isError) return <Card className="mt-6 p-6"><p>Your Tournaments could not load.</p><Button className="mt-4" onClick={() => void query.refetch()}>Retry</Button></Card>;
  const items = query.data ?? [];
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(items.length / 12) - 1));
  const visible = items.slice(page * 12, (page + 1) * 12);
  return <section className="mt-6" aria-labelledby="my-tournaments-heading"><h2 id="my-tournaments-heading" className="text-2xl font-bold">Your Tournaments</h2><p className="mt-2 text-sm text-slate-600">Smart Priority puts submissions needing attention and the nearest deadlines first across your Tournaments.</p>
    {visible.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => <Card key={item.registrationId} className="flex flex-col p-5"><h3 className="text-lg font-bold">{item.title}</h3><p className="mt-3 text-sm text-slate-600">{item.stateLabel}</p>{item.deadline ? <p className="mt-2 text-sm">Due <time dateTime={item.deadline}>{new Date(item.deadline).toLocaleString()}</time></p> : null}<LinkButton className="mt-5 w-full" href={item.href}>{item.actionLabel}</LinkButton></Card>)}</div> : <Card className="mt-5 p-6"><p>No Tournament participation is recorded.</p><LinkButton variant="secondary" className="mt-4" href="/explore?type=tournament">Explore Tournaments</LinkButton></Card>}
    {items.length > 12 ? <nav aria-label="Your Tournament pages" className="mt-5 flex items-center justify-center gap-4"><Button variant="secondary" disabled={query.isFetching || page === 0} onClick={() => setPaging({ uid: user.uid, page: page - 1 })}>Previous</Button><span>Page {page + 1}</span><Button variant="secondary" disabled={query.isFetching || (page + 1) * 12 >= items.length} onClick={() => setPaging({ uid: user.uid, page: page + 1 })}>Next</Button></nav> : null}
  </section>;
}
