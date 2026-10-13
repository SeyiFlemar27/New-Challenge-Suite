"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, LifeBuoy, Search } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-site/public-shell";
import { apiRequest } from "@/lib/api/client";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";

type Article = { id: string; slug: string; title: string; summary: string; category: string; featured: boolean; updatedAt: string };
type ArticleResponse = { articles: Article[]; categories: Array<{ id: string; label: string }>; hasMore: boolean; nextCursor: string | null; searchScanLimitReached?: boolean };

export default function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  function changeFilters(nextQuery: string, nextCategory: string) {
    setQuery(nextQuery); setCategory(nextCategory); setLoading(true); setArticles([]); setNextCursor(null); setHasMore(false); setNotice("");
  }
  useEffect(() => {
    let current = true;
    const debounce = setTimeout(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    void apiRequest<ArticleResponse>(`/api/help/articles?${params.toString()}`).then((result) => {
      if (!current) return;
      setArticles(result.data?.articles ?? []);
      setNextCursor(result.data?.nextCursor ?? null);
      setHasMore(result.data?.hasMore ?? false);
      setNotice(result.ok ? result.data?.searchScanLimitReached ? "Search scanned the newest published articles. Use a more specific term if you do not find the guidance you need." : "" : result.message);
      setLoading(false);
    });
    }, 250);
    return () => { current = false; clearTimeout(debounce); };
  }, [query, category]);
  async function loadMore() {
    if (!nextCursor || !hasMore || loading) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor: nextCursor });
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    const result = await apiRequest<ArticleResponse>(`/api/help/articles?${params.toString()}`);
    if (result.data) {
      setArticles((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.data!.articles.filter((item) => !ids.has(item.id))];
      });
      setNextCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
      if (result.data.searchScanLimitReached) setNotice("Search scanned the newest published articles. Use a more specific term if you do not find the guidance you need.");
    } else setNotice(result.message);
    setLoading(false);
  }
  const featured = articles.filter((article) => article.featured);
  return <main className="public-page"><PublicHeader />
      <section className="border-b border-[#e4e1d4] bg-[#fffdf5] py-14 sm:py-20"><div className="public-container max-w-5xl"><p className="text-sm font-bold text-[#887500]">Challenge Suite Support</p><h1 className="mt-4 text-[clamp(2.5rem,6vw,4.3rem)] font-semibold leading-tight">Help starts here.</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-[#5e5e59]">Search published guidance or browse topics. If you still need help, open a private support request.</p><label className="mt-8 flex min-h-14 items-center gap-3 rounded-[10px] border border-[#deded8] bg-white px-4 shadow-sm"><Search size={20} className="text-[#70706a]"/><span className="sr-only">Search help articles</span><input aria-label="Search help articles" value={query} onChange={(event) => changeFilters(event.target.value, category)} placeholder="Search help articles" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Help categories"><button type="button" onClick={() => changeFilters(query, "")} aria-pressed={!category} className={`rounded-full border px-4 py-2 text-sm font-bold ${!category ? "border-[#171717] bg-[#171717] text-white" : "border-[#deded8] bg-white"}`}>All topics</button>{Object.entries(SUPPORT_CATEGORIES).map(([id, item]) => <button type="button" key={id} onClick={() => changeFilters(query, category === id ? "" : id)} aria-pressed={category === id} className={`rounded-full border px-4 py-2 text-sm font-bold ${category === id ? "border-[#171717] bg-[#171717] text-white" : "border-[#deded8] bg-white"}`}>{item.label}</button>)}</div>
    </div></section>
    <section className="public-section"><div className="public-container max-w-5xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold">{query || category ? "Search results" : "Featured and recent articles"}</h2><p className="mt-2 text-sm text-[#666]">Only published Help Center content appears here.</p></div><div className="flex flex-wrap gap-3"><Link href="/support/new" className="public-primary-button justify-center"><LifeBuoy size={17}/>Contact Support</Link><Link href="/support/tickets" className="public-secondary-button justify-center">My Requests</Link></div></div>
      {notice ? <p role="status" className="mt-6 rounded-[8px] bg-amber-50 p-4 text-sm text-amber-950">{notice}</p> : null}
      {loading ? <div aria-live="polite" className="mt-8 grid gap-4 md:grid-cols-2"><div className="h-36 animate-pulse rounded-[12px] bg-[#f3f1e8]"/><div className="h-36 animate-pulse rounded-[12px] bg-[#f3f1e8]"/></div> : articles.length ? <div className="mt-8 grid gap-4 md:grid-cols-2">{articles.map((article) => <article key={article.id} className="rounded-[12px] border border-[#deded8] bg-white p-6"><p className="text-xs font-bold uppercase tracking-wide text-[#887500]">{SUPPORT_CATEGORIES[article.category as keyof typeof SUPPORT_CATEGORIES]?.label ?? "Help"}{article.featured ? " · Featured" : ""}</p><h3 className="mt-3 text-xl font-semibold"><Link className="underline-offset-4 hover:underline" href={`/help/${encodeURIComponent(article.slug)}`}>{article.title}</Link></h3><p className="mt-3 leading-7 text-[#626262]">{article.summary}</p><Link className="mt-5 inline-flex min-h-10 items-center gap-2 font-bold text-[#665800]" href={`/help/${encodeURIComponent(article.slug)}`}><BookOpen size={16}/>Read article</Link></article>)}</div> : <div className="mt-8 rounded-[12px] border border-dashed border-[#d7d3c4] bg-white p-8 text-center"><h3 className="text-lg font-semibold">{query || category ? "No matching published articles" : "Help articles are being prepared"}</h3><p className="mt-2 text-sm text-[#666]">{query || category ? "Try another search or contact Support for help with your issue." : "You can still contact Support and track your requests here."}</p><Link className="public-primary-button mt-5 justify-center" href="/support/new">Contact Support</Link></div>}
      {hasMore ? <button type="button" onClick={() => void loadMore()} disabled={loading} className="public-secondary-button mt-6 justify-center disabled:opacity-50">{loading ? "Loading…" : "Load more articles"}</button> : null}
      {featured.length ? <p className="sr-only">{featured.length} featured help articles.</p> : null}
    </div></section><PublicFooter /></main>;
}
