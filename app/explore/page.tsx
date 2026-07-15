"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { TrendingStories } from "@/components/stories/trending-stories";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fetchFeed } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
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

      <TrendingStories challenges={challenges} source="explore" isLoading={isLoading} errorMessage={errorMessage || ""} />

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Grid3X3 /></div>
            <div>
              <h2 className="text-2xl font-black">Full Challenge Listing</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Use the full challenge page for search, filters, and complete public listings.</p>
              <LinkButton href="/challenges" className="mt-5">Open Challenges</LinkButton>
            </div>
          </div>
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
