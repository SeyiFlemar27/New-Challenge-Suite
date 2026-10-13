"use client";
import { ContentImage } from "@/components/content-image";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, LockKeyhole, MapPin, Radio, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import { useAuth } from "@/components/auth-provider";

type Kind = "private" | "live" | "tournament";
type Challenge = Record<string, unknown> & { id: string; title: string; typeLabel: string };
type Payload = { challenges: Challenge[]; total: null; type: Kind; page: number; limit: number; hasMore: boolean; nextCursor: string | null };
const copy = {
  private: { title: "Private Challenges", subtitle: "Discover private challenges available to Creator and Host accounts.", empty: "No private challenges are currently available.", icon: LockKeyhole },
  live: { title: "Live Event Challenges", subtitle: "Discover physical live-event challenges you can participate in.", empty: "No live event challenges are currently available.", icon: Radio },
  tournament: { title: "Tournament Challenges", subtitle: "Discover individual tournaments with active or upcoming registration.", empty: "No tournament challenges are currently available.", icon: Trophy }
} as const;

export function ChallengeDiscoveryPage({ kind, createHref }: { kind: Kind; createHref?: string }) {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [cursors, setCursors] = useState<string[]>(() => [searchParams.get("cursor") ?? ""]);
  const [page, setPage] = useState(1);
  const cursor = cursors[page - 1] ?? "";
  const query = useQuery({ queryKey: ["challenge-discovery", user?.uid, kind, cursor], queryFn: () => apiRequest<Payload>(`/api/challenge-discovery?type=${kind}&page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), enabled: Boolean(user), staleTime: 30_000 });
  const payload = query.data?.ok ? query.data.data : null;
  const Icon = copy[kind].icon;
  const changePage = (next: number) => {
    if (query.isFetching || next < 1) return;
    if (next > page) {
      if (!payload?.hasMore || !payload.nextCursor) return;
      setCursors((previous) => [...previous.slice(0, page), payload.nextCursor!]);
    }
    setPage(next);
  };
  return <AppShell><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageTitle title={copy[kind].title} subtitle={copy[kind].subtitle} icon={<Icon />} />{createHref ? <LinkButton href={createHref} className="w-full sm:w-auto">Create {kind === "live" ? "Live Event" : kind === "tournament" ? "Tournament" : "Private Challenge"}</LinkButton> : null}</div>
    {query.isLoading ? <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse" />)}</div> : null}
    {!query.isLoading && !payload ? <Card className="mt-8 p-6"><h2 className="text-xl font-black">Discovery unavailable</h2><p className="mt-2 text-slate-400">{query.data?.message ?? "Please try again."}</p></Card> : null}
    {payload?.challenges.length ? <div id="challenge-results" className="mt-8 grid scroll-mt-24 gap-6 sm:grid-cols-2 xl:grid-cols-3">{payload.challenges.map((challenge) => <DiscoveryCard key={challenge.id} challenge={challenge} kind={kind} />)}</div> : null}
    {payload && !payload.challenges.length ? <Card className="mt-8"><EmptyState icon={<Icon className="text-[var(--gold)]" />} title={copy[kind].empty} body="Only approved, discoverable records appear here. Drafts and review-only records remain private." /></Card> : null}
    {payload ? <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Challenge result pages"><Button variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><span aria-live="polite">Page {page}</span><Button variant="secondary" disabled={!payload.hasMore || query.isFetching} onClick={() => changePage(page + 1)}>Next</Button></nav> : null}
  </div></AppShell>;
}

function DiscoveryCard({ challenge, kind }: { challenge: Challenge; kind: Kind }) {
  const image = String(challenge.coverImageUrl ?? "");
  const destination = kind === "private" ? `/challenges/${challenge.id}/access` : kind === "tournament" ? `/tournaments/${challenge.id}` : challenge.challengeId ? `/challenges/${String(challenge.challengeId)}` : `/host/live-events`;
  return <Card className="group flex h-full flex-col overflow-hidden bg-[#171717]"><div className="relative aspect-[16/10] bg-[#0f0f0f]">{image ? <ContentImage src={image} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <div className="grid h-full place-items-center text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Challenge Suite</div>}<span className="absolute left-3 top-3 rounded-[6px] bg-black/80 px-3 py-2 text-[11px] font-black text-white">{challenge.typeLabel}</span><span className="absolute bottom-3 right-3 rounded-[6px] bg-[var(--gold)] px-3 py-2 text-[11px] font-black capitalize text-black">{String(challenge.status).replaceAll("_", " ")}</span></div><div className="flex flex-1 flex-col p-5"><h2 className="line-clamp-2 text-xl font-black">{challenge.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{String(challenge.description ?? "Challenge details are available on the challenge page.")}</p><p className="mt-4 text-xs font-black text-[var(--gold)]">Created by {String(challenge.creatorDisplayName ?? "Challenge creator")}</p><div className="mt-4 grid gap-2 text-xs text-slate-300"><span className="flex items-center gap-2"><Users size={15} /> {Number(challenge.participantCount ?? 0)} participants</span><span className="flex items-center gap-2"><CalendarClock size={15} /> {formatChallengeDateTime(challenge.startsAt ?? challenge.registrationDeadline, challenge) ?? "Schedule pending"}</span>{kind === "private" ? <span className="flex items-center gap-2"><LockKeyhole size={15} /> {challenge.accessMethod === "invite_link" ? "Invite link required" : challenge.accessMethod === "invitation_code" ? "Invitation code required" : challenge.accessMethod === "direct_invitations" ? "Direct invitation required" : "Invitation required"}</span> : null}{kind === "live" && challenge.venueName ? <span className="flex items-center gap-2"><MapPin size={15} /> {String(challenge.venueName)}</span> : null}</div><LinkButton href={destination} className="mt-auto w-full pt-5">{kind === "private" ? "View Access Options" : "View Challenge"}</LinkButton></div></Card>;
}
