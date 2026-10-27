"use client";
import { ExploreChallengeCard } from "@/components/explore-challenge-card";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button, Card, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";


import { Filter, Search, SlidersHorizontal } from "lucide-react";

type ExploreChallenge = Record<string, any>;
type ExploreResponse = { challenges: ExploreChallenge[]; featured?: ExploreChallenge[]; trending?: ExploreChallenge[]; categories: string[]; total: number | null; page: number; limit: number; hasMore: boolean; nextCursor: string | null; filters: Record<string, string> };

const phaseOptions = [
  ["", "Active stages"],
  ["registration_open", "Registration"],
  ["submission_open", "Submissions"],
  ["voting_open", "Voting"],
  ["voting_closed", "Voting closed"],
  ["completed", "Completed"]
];
const entryOptions = [["", "Any entry"], ["free", "Free"], ["paid", "Paid entry"]];
const typeOptions = [["", "All types"], ["standard", "Standard"], ["private", "Private"], ["live_event", "Live Events"], ["tournament", "Tournaments"]];
const sortOptions = [["recent", "Newest"], ["participants", "Most joined"], ["ending_soon", "Ending soon"]];

export default function ExplorePage() {
  return <Suspense fallback={<AppShell><div className="min-h-screen bg-slate-50 p-8 text-center font-bold text-slate-950">Loading challenges…</div></AppShell>}><ExplorePageContent /></Suspense>;
}

function ExplorePageContent() {
  const searchParams = useSearchParams();
  const initialCursor = searchParams.get("cursor") ?? "";
  const initialPage = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [phase, setPhase] = useState(searchParams.get("phase") ?? "");
  const [entry, setEntry] = useState(searchParams.get("entry") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "recent");
  const [page, setPage] = useState(initialCursor ? initialPage : 1);
  const [cursorsByPage, setCursorsByPage] = useState<Record<number, string>>(initialCursor ? { 1: "", [initialPage]: initialCursor } : { 1: "" });
  const [data, setData] = useState<ExploreResponse | null>(null);
  const [error, setError] = useState("");
  const [loadedRequestPath, setLoadedRequestPath] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const requestPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (phase) params.set("phase", phase);
    if (entry) params.set("entry", entry);
    if (type) params.set("type", type);
    if (sort !== "recent") params.set("sort", sort);
    params.set("page", String(page));
    const cursor = cursorsByPage[page];
    if (cursor) params.set("cursor", cursor);
    return `/api/explore/challenges?${params.toString()}`;
  }, [category, cursorsByPage, entry, page, phase, query, sort, type]);
  const loading = loadedRequestPath !== requestPath;

  useEffect(() => {
    let active = true;
    void apiRequest<ExploreResponse>(requestPath).then((result) => {
      if (!active) return;
      setLoadedRequestPath(requestPath);
      if (!result.ok || !result.data) {
        setError(result.message || "Explore could not load.");
        return;
      }
      setError("");
      setData(result.data);
      if (result.data.hasMore && result.data.nextCursor) {
        setCursorsByPage((current) => ({ ...current, [page + 1]: result.data!.nextCursor! }));
      }
      const browserUrl = requestPath.replace("/api/explore/challenges", "/explore");
      window.history.replaceState(null, "", browserUrl);
    }).catch(() => {
      if (!active) return;
      setError("Explore could not load. Check your connection and try again.");
      setLoadedRequestPath(requestPath);
    });
    return () => { active = false; };
  }, [page, requestPath, reloadKey]);

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursorsByPage({ 1: "" });
    setPage(1);
    setReloadKey((value) => value + 1);
  }

  const challenges = data?.challenges ?? [];

  const categories = data?.categories ?? [];

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto max-w-[1440px] py-1 sm:py-2">
          <header data-mobile-explore-tools className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
                <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Explore Challenges</h1>
                <LinkButton href="/private/code" variant="ghost" className="mt-2">Enter Invitation Code</LinkButton>
              </div>
              <p className="text-sm font-bold text-slate-600">{loading ? "Loading challenges" : `${challenges.length.toLocaleString()} challenges on this page`}</p>
            </div>
            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={applySearch}>
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-4 text-slate-500" size={18} /><input className={`${inputClass} border-slate-200 bg-white pl-11 text-slate-950 placeholder:text-slate-500`} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search challenges, creators, categories" placeholder="Search challenges, creators, categories" /></div>
              <Button type="submit" className="w-full sm:w-auto">Search</Button>
            </form>
            <div className="mt-3 grid grid-cols-2 gap-3 md:hidden">
              <Button type="button" variant="secondary" aria-expanded={filtersOpen} aria-controls="explore-filters" onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} /> Filters</Button>
              <Button type="button" variant="secondary" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} /> Sort</Button>
            </div>
            <div id="explore-filters" className={`${filtersOpen ? "grid" : "hidden"} mt-4 gap-3 md:grid md:grid-cols-5`}>
              <Select label="Type" value={type} onChange={(value) => { setType(value); setCursorsByPage({ 1: "" }); setPage(1); }} options={typeOptions as [string, string][]} />
              <Select label="Category" value={category} onChange={(value) => { setCategory(value); setCursorsByPage({ 1: "" }); setPage(1); }} options={[["", "All categories"], ...categories.map((item) => [item, item] as [string, string])]} />
              <Select label="Stage" value={phase} onChange={(value) => { setPhase(value); setCursorsByPage({ 1: "" }); setPage(1); }} options={phaseOptions as [string, string][]} />
              <Select label="Entry" value={entry} onChange={(value) => { setEntry(value); setCursorsByPage({ 1: "" }); setPage(1); }} options={entryOptions as [string, string][]} />
              <Select label="Sort" value={sort} onChange={(value) => { setSort(value); setCursorsByPage({ 1: "" }); setPage(1); }} options={sortOptions as [string, string][]} />
            </div>
          </header>

          <section className="mt-8 scroll-mt-24" id="challenge-results">
            <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-slate-500"><SlidersHorizontal size={16} /> Browse</div>
            {loading ? <div className="mobile-card-list grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[420px] animate-pulse rounded-[8px] bg-slate-100" />)}</div> : error ? <Card className="border-red-200 bg-red-50 p-6 text-red-950"><p className="font-black">Explore could not load</p><p className="mt-2 text-sm text-red-800">{error}</p><Button className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button></Card> : challenges.length ? <div className="mobile-card-list grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{challenges.map((challenge) => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge} />)}</div> : <div className="rounded-[8px] border border-slate-200 bg-white p-10 text-center"><Filter className="mx-auto text-slate-600" size={36} /><h2 className="mt-4 text-2xl font-black text-slate-950">No challenges found</h2><p className="mt-2 text-sm text-slate-600">Adjust your search or filters.</p></div>}
            {data ? <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Explore result pages"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><span className="text-sm font-bold text-slate-600">Page {page}</span><Button variant="secondary" disabled={loading || !data.hasMore || !data.nextCursor} onClick={() => setPage((value) => value + 1)}>Next</Button></nav> : null}
          </section>
          {(!type || type === "tournament") && !phase ? <CompletedTournaments key={`${query}:${category}`} query={query} category={category} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><select className="min-h-12 w-full rounded-[8px] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-[var(--gold)]" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, labelText]) => <option key={key || labelText} value={key}>{labelText}</option>)}</select></label>;
}

function CompletedTournaments({ query, category }: { query: string; category: string }) {
  const [cursors, setCursors] = useState<string[]>([""]);
  const params = new URLSearchParams({ type: "tournament", phase: "completed", sort: "recent", page: String(cursors.length) });
  if (query.trim()) params.set("q", query.trim());
  if (category) params.set("category", category);
  if (cursors.at(-1)) params.set("cursor", cursors.at(-1)!);
  const path = `/api/explore/challenges?${params}`;
  const result = useQuery({ queryKey: ["completed-tournaments", path], queryFn: () => apiRequest<ExploreResponse>(path), staleTime: 30_000 });
  const data = result.data?.data;
  return <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="completed-tournaments-heading">
    <h2 id="completed-tournaments-heading" className="text-2xl font-bold text-slate-950">Completed Tournaments</h2>
    <p className="mt-2 text-sm text-slate-600">Explore verified outcomes, brackets and Tournament history.</p>
    {result.isLoading ? <p className="mt-5" role="status">Loading completed Tournaments…</p> : result.isError || !result.data?.ok ? <Card className="mt-5 p-5"><p>Completed Tournaments could not load.</p><Button variant="secondary" className="mt-3" onClick={() => void result.refetch()}>Retry</Button></Card> : data?.challenges.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{data.challenges.map(challenge => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge} />)}</div> : <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No completed Tournaments match these filters.</p>}
    {data && (cursors.length > 1 || data.hasMore) ? <nav className="mt-5 flex items-center justify-center gap-4" aria-label="Completed Tournament pages"><Button variant="secondary" disabled={result.isFetching || cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Previous</Button><span>Page {cursors.length}</span><Button variant="secondary" disabled={result.isFetching || !data.hasMore || !data.nextCursor} onClick={() => setCursors(value => [...value, data.nextCursor!])}>Next</Button></nav> : null}
  </section>;
}
