"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Search, Sparkles, Target } from "lucide-react";
import { canJoinChallenge, canVoteOnChallenge, getChallengeDisplayStatus } from "@/lib/challenge-status";
import { fetchFeed } from "@/lib/api/services";
import { normalizeChallenge } from "@/lib/api/normalizers";
import type { Challenge } from "@/lib/types";

const tabs = ["Active", "Trending", "Recommended", "Open"];

export default function FeedPage() {
  const [tab, setTab] = useState("Active");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const categories = ["All", ...Array.from(new Set(challenges.map((challenge) => challenge.category)))];

  async function loadFeed() {
    setLoading(true);
    setError(null);
    const result = await fetchFeed(30);
    if (!result.ok || !result.data) {
      setChallenges([]);
      setError(result.message || "Feed could not be loaded.");
      setLoading(false);
      return;
    }
    setChallenges(result.data.challenges.map((challenge) => normalizeChallenge(challenge as any)));
    setLoading(false);
  }

  useEffect(() => {
    loadFeed();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return challenges.filter((challenge) => {
      const matchesCategory = category === "All" || challenge.category === category;
      const matchesQuery = !normalized || `${challenge.title} ${challenge.description} ${challenge.category}`.toLowerCase().includes(normalized);
      const status = getChallengeDisplayStatus(challenge);
      const matchesTab = tab === "Active" ? ["Active", "Closing Soon", "Voting Open"].includes(status) : tab === "Open" ? status === "Open" : true;
      return matchesCategory && matchesQuery && matchesTab;
    });
  }, [category, query, tab]);

  function runSearch(value: string) {
    setQuery(value);
    setSearching(true);
    window.setTimeout(() => setSearching(false), 250);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Explore Feed" subtitle="Find active challenges you can join, vote on, or follow." icon={<Sparkles className="text-[var(--gold)]" />} />
        <LinkButton href="/challenges/create">Create Challenge</LinkButton>
      </div>

      <Card className="mt-8 p-4 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="scrollbar-dark flex gap-2 overflow-x-auto rounded-[10px] border border-white/10 bg-black p-2">
            {tabs.map((item) => <Button key={item} variant={tab === item ? "primary" : "ghost"} className="w-36 shrink-0" onClick={() => setTab(item)}>{item}</Button>)}
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex h-12 min-w-0 items-center gap-3 rounded-[8px] border border-white/10 bg-[#11151d] px-4 text-slate-400 md:w-80">
              <Search size={18} />
              <input className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500" value={query} onChange={(event) => runSearch(event.target.value)} placeholder="Search challenges..." />
            </div>
            <select className="h-12 rounded-[8px] border border-white/10 bg-[#11151d] px-4 font-bold text-white outline-none" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black">{tab} Challenges</h2>
          <span className="text-sm font-bold text-slate-400">{filtered.length} available</span>
        </div>
        {loading || searching ? (
          <div className="mt-6 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}
          </div>
        ) : error ? (
          <Card className="mt-6">
            <EmptyState icon={<Target />} title="Feed unavailable" body={error} action={<Button onClick={loadFeed}>Retry</Button>} />
          </Card>
        ) : filtered.length ? (
          <div className="mt-6 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((challenge) => (
              <div key={challenge.id} className="space-y-3">
                <ChallengeCard challenge={challenge} />
                <div className="grid grid-cols-2 gap-3">
                  <LinkButton href={canJoinChallenge(challenge) ? `/challenges/${challenge.id}/join` : `/challenges/${challenge.id}`} className="w-full">{canJoinChallenge(challenge) ? "Join" : "Details"}</LinkButton>
                  <LinkButton href={canVoteOnChallenge(challenge) ? `/challenges/${challenge.id}#vote` : `/challenges/${challenge.id}`} variant="secondary" className="w-full">{canVoteOnChallenge(challenge) ? "Vote" : "Voting Closed"}</LinkButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="mt-6">
            <EmptyState icon={<Target />} title="No challenges found" body="Try a different search or category filter." action={<Button onClick={() => { setQuery(""); setCategory("All"); setTab("Active"); }}>Reset Filters</Button>} />
          </Card>
        )}
      </section>
    </AppShell>
  );
}
