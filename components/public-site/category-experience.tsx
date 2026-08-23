"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ChallengePagination } from "@/components/challenge-pagination";
import { PublicFooter, PublicHeader } from "@/components/public-site/public-shell";
import { CHALLENGE_PAGE_SIZE } from "@/lib/challenge-pagination";
import type { PublicCategory } from "@/lib/public-site/config";

type Challenge = { id: string; title: string; shortDescription: string; coverImageUrl: string; category: string; detailHref: string; participantCount: number; creator: { displayName: string }; cta: { label: string; href: string; disabled?: boolean }; phaseSummary: { label: string } };

export function CategoryExperience({ category }: { category: Omit<PublicCategory, "icon"> }) {
  const [specialty, setSpecialty] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Challenge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = () => setPage(Math.max(1, Number(new URLSearchParams(window.location.search).get("page") ?? 1) || 1));
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({ category: category.name, page: String(page), sort: "recent" });
    if (search || specialty) query.set("q", search || specialty);
    fetch(`/api/explore/challenges?${query}`)
      .then((response) => response.json())
      .then((response) => {
        setItems(response.data?.challenges ?? []);
        setTotal(Number(response.data?.total ?? 0));
      })
      .finally(() => setLoading(false));
  }, [category.name, page, search, specialty]);

  const filter = (value: string) => { setSpecialty(value); setPage(1); };
  const changePage = (next: number) => {
    setPage(next);
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(next));
    window.history.pushState(null, "", url);
  };

  return <main className="public-page"><PublicHeader />
    <section className="public-section bg-[#f5f5f1]"><div className="public-container"><p className="text-sm font-bold text-[#8b7900]">Challenge category</p><h1 className="mt-4 max-w-4xl text-[clamp(2.6rem,6vw,4.8rem)] font-semibold leading-tight">{category.name} challenges</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-[#5f5f5f]">{category.description}</p><form className="mt-8 flex max-w-xl rounded-[8px] border border-[#d7d7d2] bg-white p-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}><Search className="ml-2 self-center text-[#777]" size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${category.name.toLowerCase()} challenges`} className="min-w-0 flex-1 bg-transparent px-3 outline-none" /><button className="public-primary-button">Search</button></form></div></section>
    <section className="public-section"><div className="public-container"><div className="flex flex-wrap gap-2" aria-label="Specialty filters"><button onClick={() => filter("")} className={!specialty ? "public-pill-active" : "public-pill"}>All</button>{category.specialties.map((item) => <button key={item} onClick={() => filter(item)} className={specialty === item ? "public-pill-active" : "public-pill"}>{item}</button>)}</div><div className="mt-10 flex items-end justify-between gap-4"><div><h2 className="text-3xl font-semibold">Relevant challenges</h2><p className="mt-2 text-[#666]">{total} public result{total === 1 ? "" : "s"}</p></div><Link href={`/explore?category=${encodeURIComponent(category.name)}`} className="text-sm font-bold underline">Open full search</Link></div>
      {loading ? <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-[8px] bg-[#f2f2ee]" />)}</div> : items.length ? <div id="category-challenge-results" className="mt-8 grid scroll-mt-24 gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-[8px] border border-[#deded8] bg-white"><Link href={item.detailHref} className="block aspect-[16/9] bg-[#ededeb]">{item.coverImageUrl ? <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm text-[#777]">Challenge media not available</span>}</Link><div className="p-5"><p className="text-xs font-bold text-[#8b7900]">{item.phaseSummary?.label || item.category}</p><h3 className="mt-2 text-xl font-semibold">{item.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#666]">{item.shortDescription}</p><p className="mt-4 text-xs text-[#777]">By {item.creator?.displayName} · {item.participantCount || 0} participants</p><Link href={item.cta?.href || item.detailHref} aria-disabled={item.cta?.disabled} className="public-secondary-button mt-5 w-full justify-center">{item.cta?.label || "View challenge"}<ArrowRight size={16} /></Link></div></article>)}</div> : <div className="mt-8 rounded-[8px] border border-[#deded8] bg-[#fafaf8] p-10 text-center"><h3 className="text-xl font-semibold">Oops, no challenges yet</h3><p className="mt-2 text-[#666]">Try again later.</p></div>}
      <ChallengePagination page={page} total={total} pageSize={CHALLENGE_PAGE_SIZE} disabled={loading} anchorId="category-challenge-results" onPageChange={changePage} />
    </div></section>
    <section className="public-section bg-[#f5f5f1]"><div className="public-container grid gap-8 lg:grid-cols-2"><div><p className="text-sm font-bold text-[#8b7900]">How it works</p><h2 className="mt-4 text-4xl font-semibold">Compete in {category.name.toLowerCase()}.</h2><p className="mt-4 leading-7 text-[#626262]">Review each challenge&apos;s timeline and requirements, join through its official entry flow, then submit before the deadline.</p></div><div className="rounded-[8px] bg-[#f5d90a] p-8"><h3 className="text-2xl font-semibold">Ready to find your next challenge?</h3><Link href={`/explore?category=${encodeURIComponent(category.name)}`} className="mt-6 inline-flex items-center gap-2 font-bold">Explore {category.name}<ArrowRight size={18} /></Link></div></div></section>
    <PublicFooter />
  </main>;
}
