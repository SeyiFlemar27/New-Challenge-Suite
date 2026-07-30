"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Bookmark, CalendarDays, Filter, Search, SlidersHorizontal, Trophy, Users } from "lucide-react";

type ExploreChallenge = Record<string, any>;
type ExploreResponse = { challenges: ExploreChallenge[]; featured?: ExploreChallenge[]; trending?: ExploreChallenge[]; categories: string[]; total: number; page: number; hasMore: boolean; filters: Record<string, string> };

const phaseOptions = [
  ["", "Active stages"],
  ["registration_open", "Registration"],
  ["submission_open", "Submissions"],
  ["voting_open", "Voting"],
  ["voting_closed", "Voting closed"],
  ["completed", "Completed"]
];
const entryOptions = [["", "Any entry"], ["free", "Free"], ["paid", "Paid entry"]];
const sortOptions = [["recent", "Newest"], ["participants", "Most joined"], ["ending_soon", "Ending soon"]];

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [phase, setPhase] = useState("");
  const [entry, setEntry] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") ?? "");
    setCategory(params.get("category") ?? "");
    setPhase(params.get("phase") ?? "");
    setEntry(params.get("entry") ?? "");
    setSort(params.get("sort") ?? "recent");
    setPage(Math.max(1, Number(params.get("page") ?? 1) || 1));
  }, []);

  const requestPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (phase) params.set("phase", phase);
    if (entry) params.set("entry", entry);
    if (sort !== "recent") params.set("sort", sort);
    params.set("page", String(page));
    params.set("limit", "24");
    return `/api/explore/challenges?${params.toString()}`;
  }, [category, entry, page, phase, query, sort]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<ExploreResponse>(requestPath).then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok || !result.data) {
        setError(result.message || "Explore could not load.");
        return;
      }
      setData(result.data);
      const browserUrl = requestPath.replace("/api/explore/challenges", "/explore");
      window.history.replaceState(null, "", browserUrl);
    });
    return () => { active = false; };
  }, [requestPath, reloadKey]);

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setReloadKey((value) => value + 1);
  }

  const challenges = data?.challenges ?? [];
  const trending = data?.trending ?? data?.featured ?? [];
  const categories = data?.categories ?? [];

  return (
    <AppShell>
      <div className="min-h-screen bg-[#080808] text-white">
        <div className="mx-auto max-w-[1440px] py-1 sm:py-2">
          <header data-mobile-explore-tools className="rounded-[8px] border border-white/10 bg-[#111111] p-4 shadow-2xl shadow-black/30 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
                <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Explore Challenges</h1>
              </div>
              <p className="text-sm font-bold text-slate-400">{loading ? "Loading challenges" : `${Number(data?.total ?? 0).toLocaleString()} active challenge${Number(data?.total ?? 0) === 1 ? "" : "s"}`}</p>
            </div>
            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={applySearch}>
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-4 text-slate-500" size={18} /><input className={`${inputClass} border-white/10 bg-black/40 pl-11 text-white placeholder:text-slate-500`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search challenges, creators, categories" /></div>
              <Button type="submit" className="w-full sm:w-auto">Search</Button>
            </form>
            <div className="mt-3 grid grid-cols-2 gap-3 md:hidden">
              <Button type="button" variant="secondary" onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} /> Filters</Button>
              <Button type="button" variant="secondary" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} /> Sort</Button>
            </div>
            <div className={`${filtersOpen ? "grid" : "hidden"} mt-4 gap-3 md:grid md:grid-cols-4`}>
              <Select label="Category" value={category} onChange={(value) => { setCategory(value); setPage(1); }} options={[["", "All categories"], ...categories.map((item) => [item, item] as [string, string])]} />
              <Select label="Stage" value={phase} onChange={(value) => { setPhase(value); setPage(1); }} options={phaseOptions as [string, string][]} />
              <Select label="Entry" value={entry} onChange={(value) => { setEntry(value); setPage(1); }} options={entryOptions as [string, string][]} />
              <Select label="Sort" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={sortOptions as [string, string][]} />
            </div>
          </header>

          {trending.length ? <section className="mt-7"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-white">Trending Challenges</h2><p className="mt-1 text-sm text-slate-400">Popular challenges gaining activity across Challenge Suite.</p></div><span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Real activity only</span></div><div className="flex gap-4 overflow-x-auto pb-2">{trending.map((item) => <TrendingCard key={String(item.id)} challenge={item} />)}</div></section> : null}

          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-slate-500"><SlidersHorizontal size={16} /> Browse</div>
            {loading ? <div className="mobile-card-list grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[420px] animate-pulse rounded-[8px] bg-[#151515]" />)}</div> : error ? <Card className="border-red-500/20 bg-red-950/20 p-6 text-red-100"><p className="font-black">Explore could not load</p><p className="mt-2 text-sm text-red-100/70">{error}</p><Button className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button></Card> : challenges.length ? <div className="mobile-card-list grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{challenges.map((challenge) => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge} />)}</div> : <div className="rounded-[8px] border border-white/10 bg-[#111111] p-10 text-center"><Filter className="mx-auto text-slate-600" size={36} /><h2 className="mt-4 text-2xl font-black text-white">No challenges found</h2><p className="mt-2 text-sm text-slate-400">Adjust your search or filters.</p></div>}
            {data?.hasMore ? <div className="mt-8 flex justify-center"><Button onClick={() => setPage((value) => value + 1)}>Load more challenges</Button></div> : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><select className="min-h-12 w-full rounded-[8px] border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none focus:border-[var(--gold)]" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, labelText]) => <option key={key || labelText} value={key}>{labelText}</option>)}</select></label>;
}

function TrendingCard({ challenge }: { challenge: ExploreChallenge }) {
  return <LinkButton href={detailHref(challenge)} variant="secondary" className="min-h-0 w-[280px] shrink-0 border-white/10 bg-[#151515] p-0 text-white hover:bg-[#1d1d1d]"><div className="w-full text-left"><ChallengeMediaFrame src={String(challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="h-32 rounded-b-none border-0" placeholder="Challenge Suite" /><div className="p-4"><p className="text-xs font-black uppercase text-[var(--gold)]">{challenge.phaseSummary?.label ?? "Challenge"}</p><h3 className="mt-2 line-clamp-2 font-black text-white">{challenge.title}</h3><p className="mt-2 text-xs font-bold text-slate-400">{Number(challenge.participantCount ?? 0).toLocaleString()} participants</p></div></div></LinkButton>;
}

function ExploreChallengeCard({ challenge }: { challenge: ExploreChallenge }) {
  const phase = challenge.phaseSummary ?? {};
  const paid = challenge.paidEntry?.required === true;
  const fee = paid ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(challenge.paidEntry.amountCents ?? 0) / 100) : "Free";
  const cta = challenge.cta ?? { label: "View Challenge", href: detailHref(challenge), disabled: false };
  const href = detailHref(challenge);
  const creator = challenge.creator ?? {};
  const creatorHref = creator.username ? `/profile/${creator.username}` : "/profile";
  const openCard = () => { window.location.href = href; };
  return <article data-mobile-explore-card role="link" tabIndex={0} onClick={openCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCard(); } }} className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[8px] border border-white/10 bg-[#151515] shadow-lg shadow-black/20 transition hover:border-[var(--gold)]/50 hover:bg-[#1a1a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
    <div className="relative">
      <ChallengeMediaFrame src={String(challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="aspect-[16/10] h-auto rounded-none border-0" placeholder="Challenge Suite" />
      <span className="absolute left-3 top-3"><Badge>{phase.label ?? "Challenge"}</Badge></span>
      <button type="button" onClick={(event) => event.stopPropagation()} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white backdrop-blur transition hover:text-[var(--gold)]" aria-label="Save challenge"><Bookmark size={18} /></button>
    </div>
    <div className="flex flex-1 flex-col p-4">
      <a href={creatorHref} onClick={(event) => event.stopPropagation()} className="flex min-h-11 items-center gap-3 text-sm font-black hover:text-[var(--gold)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gold)] text-xs text-black">{String(creator.displayName ?? "CS").slice(0, 2).toUpperCase()}</span>
        <span className="truncate">{creator.displayName ?? "Challenge creator"}</span>
      </a>
      <h2 className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{challenge.title}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{challenge.shortDescription || challenge.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-400">
        <span className="flex items-center gap-1"><Users size={14} /> {Number(challenge.participantCount ?? 0).toLocaleString()} joined</span>
        <span className="flex items-center gap-1"><Trophy size={14} /> {String(challenge.category ?? "General")}</span>
        <span className="col-span-2 flex items-center gap-1"><CalendarDays size={14} /> {phase.label ?? "Challenge"} / {formatShortDate(challenge.submissionDeadline) ?? "Timeline on detail"}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4"><span className="text-sm font-black text-white">{paid ? fee : "Free entry"}</span>{cta.disabled ? <Button className="min-h-11 px-4 py-2" variant="secondary" disabled>{String(cta.label ?? "Voting Closed")}</Button> : <LinkButton href={String(cta.href ?? href)} onClick={(event: any) => event.stopPropagation()} className="min-h-11 px-4 py-2">{String(cta.label ?? "View Challenge")}</LinkButton>}</div>
    </div>
  </article>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--gold)]">{children}</span>;
}

function detailHref(challenge: ExploreChallenge) {
  return String(challenge.detailHref ?? `/challenges/${challenge.id}`);
}

function formatShortDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
