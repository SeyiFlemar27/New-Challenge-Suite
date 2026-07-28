"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ChallengeMediaFrame } from "@/components/media-display";
import { CalendarDays, Filter, Search, SlidersHorizontal, Trophy, Users } from "lucide-react";

type ExploreChallenge = Record<string, any>;
type ExploreResponse = { challenges: ExploreChallenge[]; featured: ExploreChallenge[]; categories: string[]; total: number; page: number; hasMore: boolean; filters: Record<string, string> };

const phaseOptions = [
  ["", "Any stage"],
  ["registration_open", "Registration"],
  ["submission_open", "Submissions"],
  ["voting_open", "Voting"],
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
  }, [requestPath]);

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  const challenges = data?.challenges ?? [];
  const featured = data?.featured ?? [];
  const categories = data?.categories ?? [];

  return (
    <AppShell>
      <div className="min-h-screen bg-[#f5f1e8] px-0 py-0 text-[#161616] -m-4 sm:-m-6 lg:-m-8">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <header className="border-b border-black/10 pb-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6a16]">Challenge Suite Marketplace</p>
                <h1 className="mt-2 text-3xl font-black text-black sm:text-4xl">Explore Challenges</h1>
              </div>
              <p className="text-sm font-bold text-black/60">{loading ? "Loading challenges" : `${Number(data?.total ?? 0).toLocaleString()} public challenge${Number(data?.total ?? 0) === 1 ? "" : "s"}`}</p>
            </div>
            <form className="mt-5 flex flex-col gap-3 lg:flex-row" onSubmit={applySearch}>
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-4 text-black/40" size={18} /><input className={`${inputClass} border-black/10 bg-white pl-11 text-black placeholder:text-black/40`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search challenges, creators, categories" /></div>
              <Button className="bg-black text-white hover:bg-[#242424]" type="submit">Search</Button>
            </form>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Select label="Category" value={category} onChange={(value) => { setCategory(value); setPage(1); }} options={[["", "All categories"], ...categories.map((item) => [item, item] as [string, string])]} />
              <Select label="Stage" value={phase} onChange={(value) => { setPhase(value); setPage(1); }} options={phaseOptions as [string, string][]} />
              <Select label="Entry" value={entry} onChange={(value) => { setEntry(value); setPage(1); }} options={entryOptions as [string, string][]} />
              <Select label="Sort" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={sortOptions as [string, string][]} />
            </div>
          </header>

          {featured.length ? <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black text-black">Featured challenges</h2><span className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Real activity only</span></div><div className="flex gap-4 overflow-x-auto pb-2">{featured.map((item) => <FeaturedCard key={String(item.id)} challenge={item} />)}</div></section> : null}

          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-black/50"><SlidersHorizontal size={16} /> Browse</div>
            {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[390px] animate-pulse rounded-[8px] bg-white" />)}</div> : error ? <Card className="border-black/10 bg-white p-6 text-black"><p className="font-black">Explore could not load</p><p className="mt-2 text-sm text-black/60">{error}</p><Button className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button></Card> : challenges.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{challenges.map((challenge) => <ExploreChallengeCard key={String(challenge.id)} challenge={challenge} />)}</div> : <div className="rounded-[8px] border border-black/10 bg-white p-10 text-center"><Filter className="mx-auto text-black/30" size={36} /><h2 className="mt-4 text-2xl font-black text-black">No challenges found</h2><p className="mt-2 text-sm text-black/60">Adjust your search or filters.</p></div>}
            {data?.hasMore ? <div className="mt-8 flex justify-center"><Button className="bg-black text-white hover:bg-[#242424]" onClick={() => setPage((value) => value + 1)}>Load more challenges</Button></div> : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-black/50">{label}</span><select className="min-h-12 w-full rounded-[8px] border border-black/10 bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#b58a1f]" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, labelText]) => <option key={key || labelText} value={key}>{labelText}</option>)}</select></label>;
}

function FeaturedCard({ challenge }: { challenge: ExploreChallenge }) {
  return <LinkButton href={`/challenges/${challenge.id}`} variant="secondary" className="min-h-0 w-[280px] shrink-0 border-black/10 bg-white p-0 text-black hover:bg-white"><div className="w-full text-left"><ChallengeMediaFrame src={String(challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="h-32 rounded-b-none border-0" placeholder="Challenge Suite" /><div className="p-4"><p className="text-xs font-black uppercase text-[#8c6a16]">{challenge.phaseSummary?.label ?? "Challenge"}</p><h3 className="mt-2 line-clamp-2 font-black text-black">{challenge.title}</h3><p className="mt-2 text-xs font-bold text-black/50">{Number(challenge.participantCount ?? 0).toLocaleString()} participants</p></div></div></LinkButton>;
}

function ExploreChallengeCard({ challenge }: { challenge: ExploreChallenge }) {
  const phase = challenge.phaseSummary ?? {};
  const paid = challenge.paidEntry?.required === true;
  const fee = paid ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(challenge.paidEntry.amountCents ?? 0) / 100) : "Free";
  const cta = challenge.cta ?? { label: "View Challenge", href: `/challenges/${challenge.id}` };
  return <article className="flex h-full flex-col overflow-hidden rounded-[8px] border border-black/10 bg-white shadow-sm"><ChallengeMediaFrame src={String(challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="h-44 rounded-none border-0" placeholder="Challenge Suite" /><div className="flex flex-1 flex-col p-4"><div className="flex flex-wrap gap-2"><Badge>{phase.label ?? "Challenge"}</Badge>{paid ? <Badge>{fee}</Badge> : <Badge>Free entry</Badge>}</div><h2 className="mt-3 line-clamp-2 min-h-12 text-lg font-black leading-tight text-black">{challenge.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-black/60">{challenge.shortDescription || challenge.description}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-black/60"><span className="flex items-center gap-1"><Users size={14} /> {Number(challenge.participantCount ?? 0).toLocaleString()}</span><span className="flex items-center gap-1"><Trophy size={14} /> {String(challenge.category ?? "General")}</span><span className="col-span-2 flex items-center gap-1"><CalendarDays size={14} /> {formatShortDate(challenge.submissionDeadline) ?? "Timeline listed on detail"}</span></div><div className="mt-auto pt-4"><LinkButton href={String(cta.href ?? `/challenges/${challenge.id}`)} className="w-full bg-black text-white hover:bg-[#242424]">{String(cta.label ?? "View Challenge")}</LinkButton></div></div></article>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-black/70">{children}</span>;
}

function formatShortDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

