"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { TrendingStories } from "@/components/stories/trending-stories";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fetchFeed } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { ChallengeMediaFrame } from "@/components/media-display";
import { getChallengeDisplayStatus, getChallengeLifecycleState, statusClassName } from "@/lib/challenge-status";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Compass } from "lucide-react";

export default function ExplorePage() {
  const { user } = useCurrentUser();
  const { data, isLoading } = useQuery({ queryKey: ["explore-feed"], queryFn: () => fetchFeed(40), staleTime: 30_000 });
  const challenges = useMemo(() => {
    if (!data?.ok) return [];
    const userId = String(user?.uid ?? "");
    return (data.data?.challenges ?? [])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) }))
      .filter((item) => item.id)
      .filter((item) => !userId || !isOwnedByUser(item as Record<string, unknown>, userId));
  }, [data, user?.uid]);
  const trendingChallenges = useMemo(() => challenges.filter((challenge) => {
    const record = challenge as Record<string, unknown>;
    const lifecycle = getChallengeLifecycleState(record);
    const status = String(record.status ?? record.lifecycleStatus ?? "").toLowerCase();
    const participantCount = Number(record.participantCount ?? record.participants ?? 0);
    const recent = Date.now() - new Date(String(record.publishedAt ?? record.createdAt ?? record.updatedAt ?? 0)).getTime() <= 1000 * 60 * 60 * 24 * 30;
    const openOrActive = lifecycle.canJoin || lifecycle.canSubmit || ["published", "registration_open", "active", "submission_open", "voting_open"].includes(status);
    return participantCount >= 100 && openOrActive && recent;
  }), [challenges]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : "";

  return (
    <AppShell>
      <PageTitle title="Explore" subtitle="Discover public challenges." icon={<Compass className="text-[var(--gold)]" />} />

      {trendingChallenges.length ? <TrendingStories challenges={trendingChallenges} source="explore" isLoading={isLoading} errorMessage={errorMessage || ""} /> : null}

      <section className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-black">Public Challenges</h2>
          </div>
          {trendingChallenges.length ? <span className="text-sm font-bold text-slate-400">Trending requires 100+ participants</span> : null}
        </div>
        {isLoading ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-[330px] animate-pulse bg-[#171717]" />)}</div> : errorMessage ? <Card className="mt-5 p-6 text-slate-300">{errorMessage}</Card> : challenges.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{challenges.map((challenge) => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge as Record<string, unknown>} />)}</div> : <Card className="mt-5 border-dashed p-8 text-center text-sm text-slate-400">No public challenges available.</Card>}
      </section>
    </AppShell>
  );
}

function isOwnedByUser(challenge: Record<string, unknown>, userId: string) {
  return [challenge.userId, challenge.ownerId, challenge.creatorId, challenge.hostId, challenge.createdBy, challenge.createdByUserId]
    .some((value) => String(value ?? "") === userId);
}

function ExploreChallengeCard({ challenge }: { challenge: Record<string, unknown> }) {
  const status = getChallengeDisplayStatus(challenge);
  const participantCount = Number(challenge.participantCount ?? challenge.participants ?? 0);
  const href = `/challenges/${String(challenge.id)}`;
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <ChallengeMediaFrame src={String(challenge.imageUrl ?? challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="rounded-none border-0" placeholder="Challenge Suite" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${statusClassName(status)}`}>{status}</span>
          {participantCount >= 100 ? <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[11px] font-black uppercase text-[var(--gold)]">Trending</span> : null}
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-12 break-words text-base font-black">{String(challenge.title ?? "Untitled Challenge")}</h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-400">{String(challenge.description ?? "")}</p>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
          <span>{participantCount.toLocaleString()} participants</span>
          <span>{String(challenge.category ?? "General")}</span>
        </div>
        <LinkButton href={href} className="mt-4 w-full">View Challenge</LinkButton>
      </div>
    </Card>
  );
}
