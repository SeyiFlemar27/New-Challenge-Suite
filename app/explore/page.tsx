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
import { Compass, Grid3X3, PlusSquare } from "lucide-react";

export default function ExplorePage() {
  const { data, isLoading } = useQuery({ queryKey: ["explore-feed"], queryFn: () => fetchFeed(30), staleTime: 30_000 });
  const challenges = useMemo(() => {
    if (!data?.ok) return [];
    return (data.data?.challenges ?? [])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) }))
      .filter((item) => item.id);
  }, [data]);
  const categories = useMemo(() => Array.from(new Set(challenges.map((challenge) => String(challenge.category ?? "General")).filter(Boolean))).slice(0, 8), [challenges]);
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
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Explore" subtitle="Discover trending public challenges, then open the full challenge listing when you are ready to browse deeper." icon={<Compass className="text-[var(--gold)]" />} />
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/challenges">View All Challenges</LinkButton>
          <LinkButton href="/challenges/create" variant="secondary">Create Challenge</LinkButton>
        </div>
      </div>

      <TrendingStories challenges={trendingChallenges} source="explore" isLoading={isLoading} errorMessage={errorMessage || ""} />

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Grid3X3 /></div>
            <div>
              <h2 className="text-2xl font-black">Public Challenge Grid</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Browse real public challenges from the live feed. Trending requires at least 100 participants and an active, open, or recent challenge state.</p>
            </div>
          </div>
          {challenges.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{challenges.map((challenge) => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge} />)}</div> : <p className="mt-6 rounded-[8px] border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No public challenges are available yet.</p>}
        </Card>
        <Card className="p-6">
          <PlusSquare className="text-[var(--gold)]" />
          <h2 className="mt-3 text-xl font-black">Start a Public Challenge</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Free users can create public basic challenges within the configured limit.</p>
          <LinkButton href="/challenges/create" variant="secondary" className="mt-5 w-full">Create Challenge</LinkButton>
        </Card>
      </div>

      {categories.length ? <Card className="mt-8 p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Categories</p>
        <div className="mt-4 flex flex-wrap gap-3">{categories.map((category) => <span key={category} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-bold text-slate-300">{category}</span>)}</div>
      </Card> : null}
    </AppShell>
  );
}

function ExploreChallengeCard({ challenge }: { challenge: Record<string, unknown> }) {
  const status = getChallengeDisplayStatus(challenge);
  const participantCount = Number(challenge.participantCount ?? challenge.participants ?? 0);
  const href = `/challenges/${String(challenge.id)}`;
  return (
    <a href={href} className="block overflow-hidden rounded-[8px] border border-white/10 bg-[#151515] transition hover:border-[var(--gold)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
      <ChallengeMediaFrame src={String(challenge.imageUrl ?? challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="rounded-none border-0" placeholder="Challenge Suite" />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${statusClassName(status)}`}>{status}</span>
          {participantCount >= 100 ? <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[11px] font-black uppercase text-[var(--gold)]">Trending</span> : null}
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-12 break-words text-base font-black">{String(challenge.title ?? "Untitled Challenge")}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{String(challenge.description ?? "Open challenge")}</p>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
          <span>{participantCount.toLocaleString()} participants</span>
          <span>{String(challenge.category ?? "General")}</span>
        </div>
      </div>
    </a>
  );
}
